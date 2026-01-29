import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { Octokit } from '@octokit/rest';
import { ContentType, ExtractedContent } from '../types.js';
import { secureFetch, URLValidationError } from './url-validator.js';

// Initialize Turndown for HTML to Markdown conversion
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Configure Turndown to preserve code blocks
turndown.addRule('codeblocks', {
  filter: ['pre'],
  replacement: (content, node) => {
    // node is a DOM-like object from cheerio/turndown, cast carefully
    const element = node as unknown as { querySelector?: (sel: string) => { className?: string; textContent?: string } | null };
    const codeElement = element.querySelector?.('code');
    const language = codeElement?.className?.match(/language-(\w+)/)?.[1] || '';
    const code = codeElement?.textContent || content;
    return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
  }
});

// Initialize Octokit (optional, uses GITHUB_TOKEN if available)
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * Base interface for content extractors
 */
export interface ContentExtractor {
  extract(source: string): Promise<ExtractedContent>;
}

/**
 * Detect content type from URL
 */
export function detectContentType(url: string): ContentType {
  const urlLower = url.toLowerCase();
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;

  // GitHub detection
  if (hostname.includes('github.com')) {
    if (urlLower.includes('/issues/') || urlLower.includes('/pull/')) {
      return 'github_issue';
    }
    return 'github_repo';
  }

  // Twitter/X detection
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }

  // Default to article
  return 'article';
}

/**
 * Parse URL to extract GitHub info
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; type: string; number?: number; path?: string } | null {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);

    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];

    // Issue or PR
    if (parts[2] === 'issues' || parts[2] === 'pull') {
      return { owner, repo, type: parts[2], number: parseInt(parts[3]) };
    }

    // File or directory (blob or tree)
    if (parts[2] === 'blob' || parts[2] === 'tree') {
      // parts[3] is the branch, rest is path
      const path = parts.slice(4).join('/');
      return { owner, repo, type: parts[2], path };
    }

    // README or root
    return { owner, repo, type: 'repo' };
  } catch {
    return null;
  }
}

/**
 * Article extractor - fetches URL and converts HTML to Markdown
 */
export class ArticleExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractedContent> {
    try {
      // Use secure fetch with SSRF protection
      const response = await secureFetch(url, {
        headers: {
          'User-Agent': 'EntropyWiki/1.0 (content extraction)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      }, {
        timeoutMs: 15000, // 15 second timeout for content extraction
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract title
      const title = $('meta[property="og:title"]').attr('content')
        || $('meta[name="twitter:title"]').attr('content')
        || $('title').text()
        || null;

      // Extract description/summary
      const summary = $('meta[property="og:description"]').attr('content')
        || $('meta[name="description"]').attr('content')
        || $('meta[name="twitter:description"]').attr('content')
        || null;

      // Extract main content - try common content containers
      let contentElement = $('article').first();
      if (!contentElement.length) contentElement = $('[role="main"]').first();
      if (!contentElement.length) contentElement = $('main').first();
      if (!contentElement.length) contentElement = $('.content, .post-content, .article-content, .entry-content').first();
      if (!contentElement.length) contentElement = $('body');

      // Remove unwanted elements
      contentElement.find('script, style, nav, header, footer, aside, .comments, .sidebar, .advertisement').remove();

      // Convert to markdown
      const contentHtml = contentElement.html() || '';
      const content = turndown.turndown(contentHtml).trim();

      // Extract topics from meta keywords or common tag patterns
      const keywordsStr = $('meta[name="keywords"]').attr('content') || '';
      const topics = keywordsStr
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0 && t.length < 50);

      return {
        title: title?.trim() || null,
        summary: summary?.trim() || null,
        content: content || null,
        topics,
        entities: null,
        confidence: content ? 0.8 : 0.3,
      };
    } catch (error: any) {
      console.error('ArticleExtractor error:', error.message);
      return {
        title: null,
        summary: null,
        content: null,
        topics: [],
        entities: { error: error.message },
        confidence: 0,
      };
    }
  }
}

/**
 * GitHub extractor - uses Octokit API for repos, issues, and docs
 */
export class GitHubExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractedContent> {
    const parsed = parseGitHubUrl(url);

    if (!parsed) {
      return {
        title: null,
        summary: 'Could not parse GitHub URL',
        content: null,
        topics: [],
        entities: { error: 'Invalid GitHub URL format' },
        confidence: 0,
      };
    }

    try {
      const { owner, repo, type, number, path } = parsed;

      // Issue or PR
      if ((type === 'issues' || type === 'pull') && number) {
        return await this.extractIssue(owner, repo, number, type === 'pull');
      }

      // File content
      if (type === 'blob' && path) {
        return await this.extractFile(owner, repo, path);
      }

      // Repository README
      return await this.extractRepo(owner, repo);
    } catch (error: any) {
      console.error('GitHubExtractor error:', error.message);
      return {
        title: null,
        summary: null,
        content: null,
        topics: [],
        entities: { error: error.message },
        confidence: 0,
      };
    }
  }

  private async extractIssue(owner: string, repo: string, number: number, isPR: boolean): Promise<ExtractedContent> {
    // Use the appropriate endpoint and parameter name based on type
    const response = isPR
      ? await octokit.pulls.get({ owner, repo, pull_number: number })
      : await octokit.issues.get({ owner, repo, issue_number: number });
    const item = response.data as any;

    const title = item.title;
    const body = item.body || '';
    const state = item.state;
    const labels = item.labels?.map((l: any) => l.name || l) || [];

    const content = `# ${isPR ? 'PR' : 'Issue'} #${number}: ${title}

**State:** ${state}
**Labels:** ${labels.join(', ') || 'None'}
**Author:** ${item.user?.login || 'Unknown'}
**Created:** ${item.created_at}
**URL:** ${item.html_url}

## Description

${body}`;

    return {
      title: `${isPR ? 'PR' : 'Issue'} #${number}: ${title}`,
      summary: body.slice(0, 200) + (body.length > 200 ? '...' : ''),
      content,
      topics: labels,
      entities: {
        github: {
          owner,
          repo,
          type: isPR ? 'pull_request' : 'issue',
          number,
          state,
          author: item.user?.login,
        },
      },
      confidence: 0.95,
    };
  }

  private async extractFile(owner: string, repo: string, path: string): Promise<ExtractedContent> {
    const response = await octokit.repos.getContent({ owner, repo, path });
    const file = response.data as any;

    if (file.type !== 'file') {
      return {
        title: path,
        summary: 'Directory, not a file',
        content: null,
        topics: [],
        entities: { github: { owner, repo, path, type: 'directory' } },
        confidence: 0.3,
      };
    }

    // Security: Check file size before decoding to prevent memory exhaustion
    const maxFileSize = 5 * 1024 * 1024; // 5MB limit
    if (file.size && file.size > maxFileSize) {
      return {
        title: path.split('/').pop() || path,
        summary: `File too large (${Math.round(file.size / 1024)}KB, max 5MB)`,
        content: null,
        topics: ['large-file'],
        entities: { github: { owner, repo, path, type: 'file', error: 'file_too_large' } },
        confidence: 0.1,
      };
    }

    // Validate base64 content exists and is reasonable length
    if (!file.content || typeof file.content !== 'string') {
      throw new Error('No file content received from GitHub API');
    }

    // Additional safety: check base64 string length (rough size check)
    const estimatedSize = (file.content.length * 3) / 4; // Base64 expansion factor
    if (estimatedSize > maxFileSize) {
      return {
        title: path.split('/').pop() || path,
        summary: `File content too large for extraction`,
        content: null,
        topics: ['large-file'],
        entities: { github: { owner, repo, path, type: 'file', error: 'content_too_large' } },
        confidence: 0.1,
      };
    }

    let content: string;
    try {
      content = Buffer.from(file.content, 'base64').toString('utf-8');
    } catch (error) {
      throw new Error(`Failed to decode file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const isMarkdown = path.endsWith('.md') || path.endsWith('.markdown');

    return {
      title: path.split('/').pop() || path,
      summary: `File from ${owner}/${repo}`,
      content: isMarkdown ? content : `\`\`\`\n${content}\n\`\`\``,
      topics: [path.split('.').pop() || 'file'],
      entities: {
        github: { owner, repo, path, type: 'file', sha: file.sha },
      },
      confidence: 0.9,
    };
  }

  private async extractRepo(owner: string, repo: string): Promise<ExtractedContent> {
    const [repoResponse, readmeResponse] = await Promise.all([
      octokit.repos.get({ owner, repo }),
      octokit.repos.getReadme({ owner, repo }).catch(() => null),
    ]);

    const repoData = repoResponse.data;
    let readmeContent = '';

    if (readmeResponse) {
      const readme = readmeResponse.data as any;

      // Security: Check README size before decoding
      const maxReadmeSize = 1 * 1024 * 1024; // 1MB limit for README
      if (readme.size && readme.size > maxReadmeSize) {
        readmeContent = `[README too large for extraction: ${Math.round(readme.size / 1024)}KB]`;
      } else if (readme.content && typeof readme.content === 'string') {
        try {
          readmeContent = Buffer.from(readme.content, 'base64').toString('utf-8');
        } catch (error) {
          readmeContent = '[README decode error]';
          console.warn(`Failed to decode README for ${owner}/${repo}:`, error);
        }
      }
    }

    const topics = repoData.topics || [];

    const content = `# ${repoData.full_name}

${repoData.description || 'No description provided.'}

**Language:** ${repoData.language || 'Not specified'}
**Stars:** ${repoData.stargazers_count}
**Forks:** ${repoData.forks_count}
**Topics:** ${topics.join(', ') || 'None'}
**License:** ${repoData.license?.name || 'Not specified'}
**URL:** ${repoData.html_url}

---

${readmeContent}`;

    return {
      title: repoData.full_name,
      summary: repoData.description,
      content,
      topics,
      entities: {
        github: {
          owner,
          repo,
          type: 'repository',
          language: repoData.language,
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
        },
      },
      confidence: 0.95,
    };
  }
}

/**
 * Twitter/X extractor - uses oEmbed API
 */
export class TwitterExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractedContent> {
    try {
      // Use Twitter oEmbed API with secure fetch
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
      const response = await secureFetch(oembedUrl, {}, { timeoutMs: 10000 });

      if (!response.ok) {
        throw new Error(`oEmbed API returned ${response.status}`);
      }

      const data = await response.json() as {
        author_name?: string;
        author_url?: string;
        html?: string;
        url?: string;
      };

      // Parse the HTML embed to extract text
      const $ = cheerio.load(data.html || '');
      const tweetText = $('p').text().trim();

      const content = `# Tweet by ${data.author_name}

${tweetText}

**Author:** [@${data.author_name}](${data.author_url})
**URL:** ${data.url || url}`;

      return {
        title: `Tweet by ${data.author_name}`,
        summary: tweetText.slice(0, 200) + (tweetText.length > 200 ? '...' : ''),
        content,
        topics: [],
        entities: {
          twitter: {
            author: data.author_name,
            author_url: data.author_url,
            url: data.url || url,
          },
        },
        confidence: 0.85,
      };
    } catch (error: any) {
      console.error('TwitterExtractor error:', error.message);
      return {
        title: null,
        summary: null,
        content: null,
        topics: [],
        entities: { error: error.message },
        confidence: 0,
      };
    }
  }
}

/**
 * Raw text extractor - pass-through with optional title extraction
 */
export class RawTextExtractor implements ContentExtractor {
  async extract(text: string): Promise<ExtractedContent> {
    // Try to extract title from first line if it looks like a heading
    let title: string | null = null;
    let content = text;

    const lines = text.split('\n');
    const firstLine = lines[0]?.trim();

    if (firstLine) {
      // Check if first line is a markdown heading
      const headingMatch = firstLine.match(/^#+\s+(.+)$/);
      if (headingMatch) {
        title = headingMatch[1];
        content = lines.slice(1).join('\n').trim();
      } else if (firstLine.length < 100 && !firstLine.includes('.')) {
        // Short first line without period might be a title
        title = firstLine;
        content = lines.slice(1).join('\n').trim();
      }
    }

    // Generate summary from first paragraph
    const firstParagraph = content.split('\n\n')[0]?.trim() || '';
    const summary = firstParagraph.slice(0, 200) + (firstParagraph.length > 200 ? '...' : '');

    return {
      title,
      summary: summary || null,
      content: content || text,
      topics: [],
      entities: null,
      confidence: title ? 0.7 : 0.5,
    };
  }
}

/**
 * Extract content based on detected or specified content type
 */
export async function extractContent(
  source: string,
  contentType?: ContentType
): Promise<ExtractedContent> {
  // Determine if source is URL or raw text
  const isUrl = source.startsWith('http://') || source.startsWith('https://');

  if (!isUrl) {
    const extractor = new RawTextExtractor();
    return extractor.extract(source);
  }

  // Detect content type from URL if not specified
  const detectedType = contentType || detectContentType(source);

  let extractor: ContentExtractor;

  switch (detectedType) {
    case 'github_repo':
    case 'github_issue':
      extractor = new GitHubExtractor();
      break;
    case 'twitter':
      extractor = new TwitterExtractor();
      break;
    case 'article':
    default:
      extractor = new ArticleExtractor();
      break;
  }

  return extractor.extract(source);
}

// Classes are already exported above, no duplicate export needed
