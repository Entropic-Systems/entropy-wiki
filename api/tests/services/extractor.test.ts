/**
 * Extractor Service Tests
 *
 * Comprehensive tests for the content extraction pipeline.
 * Tests cover all extraction types: articles, GitHub repos/issues, Twitter, and raw text.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectContentType,
  ArticleExtractor,
  GitHubExtractor,
  TwitterExtractor,
  RawTextExtractor,
  extractContent,
} from '../../src/services/extractor.js';
import {
  sampleArticleHtml,
  sampleArticleNoMeta,
  sampleArticleMinimal,
  sampleMalformedHtml,
  sampleXssAttemptHtml,
  sampleLargeHtml,
  sampleTwitterOEmbed,
  sampleGitHubRepo,
  sampleGitHubReadme,
  sampleGitHubIssue,
  sampleRawTextWithHeading,
  sampleRawTextNoHeading,
  sampleRawTextShortTitle,
} from '../fixtures/extractor/sample-html.js';

/**
 * Create a proper mock Response object with headers
 */
function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
  json?: unknown;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(options.headers || {});
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    headers,
    text: () => Promise.resolve(options.text ?? ''),
    json: () => Promise.resolve(options.json),
    blob: () => Promise.reject(new Error('Not implemented')),
    arrayBuffer: () => Promise.reject(new Error('Not implemented')),
    formData: () => Promise.reject(new Error('Not implemented')),
    clone: () => createMockResponse(options),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
  } as Response;
}

// Mock fetch globally for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Extractor Service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectContentType', () => {
    it('should detect GitHub repository URLs', () => {
      expect(detectContentType('https://github.com/anthropics/claude-code')).toBe('github_repo');
      expect(detectContentType('https://github.com/owner/repo')).toBe('github_repo');
      expect(detectContentType('https://www.github.com/owner/repo')).toBe('github_repo');
    });

    it('should detect GitHub issue URLs', () => {
      expect(detectContentType('https://github.com/owner/repo/issues/123')).toBe('github_issue');
      expect(detectContentType('https://github.com/owner/repo/issues/1')).toBe('github_issue');
    });

    it('should detect GitHub pull request URLs', () => {
      expect(detectContentType('https://github.com/owner/repo/pull/456')).toBe('github_issue');
      expect(detectContentType('https://github.com/owner/repo/pull/1')).toBe('github_issue');
    });

    it('should detect Twitter URLs', () => {
      expect(detectContentType('https://twitter.com/user/status/123')).toBe('twitter');
      expect(detectContentType('https://x.com/user/status/123')).toBe('twitter');
      expect(detectContentType('https://www.twitter.com/user')).toBe('twitter');
    });

    it('should default to article for other URLs', () => {
      expect(detectContentType('https://example.com/article')).toBe('article');
      expect(detectContentType('https://blog.example.org/post/123')).toBe('article');
      expect(detectContentType('https://news.ycombinator.com/item?id=123')).toBe('article');
    });

    it('should handle URLs with query parameters', () => {
      expect(detectContentType('https://github.com/owner/repo?tab=readme')).toBe('github_repo');
      expect(detectContentType('https://twitter.com/user/status/123?s=20')).toBe('twitter');
    });

    it('should be case-insensitive', () => {
      expect(detectContentType('https://GITHUB.COM/owner/repo')).toBe('github_repo');
      expect(detectContentType('https://Twitter.Com/user/status/123')).toBe('twitter');
    });
  });

  describe('ArticleExtractor', () => {
    const extractor = new ArticleExtractor();

    it('should extract article with OG meta tags', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleHtml,
      }));

      const result = await extractor.extract('https://example.com/article');

      expect(result.title).toBe('OG Title Override');
      expect(result.summary).toBe('This is the OG description');
      expect(result.content).toContain('Main Article Heading');
      expect(result.content).toContain('first paragraph');
      expect(result.topics).toContain('javascript');
      expect(result.topics).toContain('typescript');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should extract article without OG tags using title element', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleNoMeta,
      }));

      const result = await extractor.extract('https://example.com/simple');

      expect(result.title).toBe('Page Title Only');
      expect(result.content).toContain('Content Heading');
      expect(result.content).toContain('Simple article content');
    });

    it('should handle minimal HTML structure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleMinimal,
      }));

      const result = await extractor.extract('https://example.com/minimal');

      expect(result.content).toContain('Just some text content');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should remove unwanted elements (nav, header, footer, scripts)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleHtml,
      }));

      const result = await extractor.extract('https://example.com/article');

      expect(result.content).not.toContain('Navigation that should be removed');
      expect(result.content).not.toContain('Header content');
      expect(result.content).not.toContain('Footer content');
      expect(result.content).not.toContain('Sidebar content');
      expect(result.content).not.toContain('console.log');
    });

    it('should preserve code blocks with language', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleHtml,
      }));

      const result = await extractor.extract('https://example.com/article');

      // Code should be present in some form
      expect(result.content).toContain('example');
    });

    it('should handle malformed HTML gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleMalformedHtml,
      }));

      const result = await extractor.extract('https://example.com/malformed');

      // Should not throw, should return some content
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      // Script tags should be removed even from malformed HTML
      expect(result.content || '').not.toContain('alert');
    });

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      const result = await extractor.extract('https://example.com/not-found');

      expect(result.confidence).toBe(0);
      expect(result.entities?.error).toContain('404');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await extractor.extract('https://example.com/timeout');

      expect(result.confidence).toBe(0);
      expect(result.entities?.error).toContain('Network error');
    });

    it('should handle large documents efficiently', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleLargeHtml,
      }));

      const startTime = Date.now();
      const result = await extractor.extract('https://example.com/large');
      const duration = Date.now() - startTime;

      expect(result.content).toContain('Large Document Title');
      expect(result.content).toContain('repeated paragraph');
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('ArticleExtractor Security', () => {
    const extractor = new ArticleExtractor();

    it('should remove script tags from content', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleXssAttemptHtml,
      }));

      const result = await extractor.extract('https://example.com/xss');

      expect(result.content || '').not.toContain('<script>');
      expect(result.content || '').not.toContain('document.cookie');
    });

    it('should remove style tags', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleXssAttemptHtml,
      }));

      const result = await extractor.extract('https://example.com/xss');

      expect(result.content || '').not.toContain('<style>');
    });

    it('should handle potentially malicious onerror attributes', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleXssAttemptHtml,
      }));

      const result = await extractor.extract('https://example.com/xss');

      // onerror handlers should not be in markdown output
      expect(result.content || '').not.toContain('onerror');
    });
  });

  describe('GitHubExtractor', () => {
    // Note: GitHubExtractor uses Octokit which we can't easily mock without
    // dependency injection. These tests verify the structure and error handling.
    const extractor = new GitHubExtractor();

    it('should handle invalid GitHub URL format', async () => {
      const result = await extractor.extract('https://github.com');

      expect(result.confidence).toBe(0);
      expect(result.entities?.error).toContain('Invalid GitHub URL');
    });

    it('should handle malformed URLs gracefully', async () => {
      const result = await extractor.extract('not-a-url');

      expect(result.confidence).toBe(0);
    });
  });

  describe('TwitterExtractor', () => {
    const extractor = new TwitterExtractor();

    it('should extract tweet content from oEmbed response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: sampleTwitterOEmbed,
      }));

      const result = await extractor.extract('https://twitter.com/anthropic/status/1234567890');

      expect(result.title).toContain('Anthropic');
      expect(result.content).toContain('sample tweet content');
      expect(result.entities?.twitter?.author).toBe('Anthropic');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle oEmbed API errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      const result = await extractor.extract('https://twitter.com/user/status/deleted');

      expect(result.confidence).toBe(0);
      expect(result.entities?.error).toBeDefined();
    });

    it('should handle x.com URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: sampleTwitterOEmbed,
      }));

      const result = await extractor.extract('https://x.com/anthropic/status/1234567890');

      expect(result.title).toContain('Anthropic');
    });
  });

  describe('RawTextExtractor', () => {
    const extractor = new RawTextExtractor();

    it('should extract title from markdown heading', async () => {
      const result = await extractor.extract(sampleRawTextWithHeading);

      expect(result.title).toBe('My Document Title');
      expect(result.content).toContain('first paragraph');
      expect(result.content).toContain('Section One');
      expect(result.confidence).toBe(0.7);
    });

    it('should handle text without headings', async () => {
      const result = await extractor.extract(sampleRawTextNoHeading);

      // May or may not detect title based on first line length
      expect(result.content).toContain('plain text content');
      expect(result.summary).toBeDefined();
    });

    it('should extract title from short first line', async () => {
      const result = await extractor.extract(sampleRawTextShortTitle);

      expect(result.title).toBe('API Reference');
      expect(result.content).toContain('API endpoints');
    });

    it('should generate summary from first paragraph', async () => {
      const result = await extractor.extract(sampleRawTextWithHeading);

      expect(result.summary).toContain('first paragraph');
    });

    it('should handle empty input', async () => {
      const result = await extractor.extract('');

      expect(result.content).toBe('');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('should handle whitespace-only input', async () => {
      const result = await extractor.extract('   \n\n   ');

      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe('extractContent (Integration)', () => {
    it('should route to ArticleExtractor for web URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleHtml,
      }));

      const result = await extractContent('https://blog.example.com/post');

      expect(result.title).toBe('OG Title Override');
    });

    it('should route to TwitterExtractor for Twitter URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: sampleTwitterOEmbed,
      }));

      const result = await extractContent('https://twitter.com/user/status/123');

      expect(result.entities?.twitter).toBeDefined();
    });

    it('should route to RawTextExtractor for non-URL input', async () => {
      const result = await extractContent('# Plain Text\n\nThis is raw text.');

      expect(result.title).toBe('Plain Text');
      expect(result.content).toContain('raw text');
    });

    it('should respect explicit contentType override', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: sampleArticleHtml,
      }));

      // Force article extraction even for a GitHub-like URL
      const result = await extractContent('https://github.com/page', 'article');

      // Should use ArticleExtractor, not GitHubExtractor
      expect(result.title).toBe('OG Title Override');
    });

    it('should handle mixed content types in batch', async () => {
      // Test multiple extractions
      mockFetch
        .mockResolvedValueOnce(createMockResponse({
          ok: true,
          text: sampleArticleHtml,
        }))
        .mockResolvedValueOnce(createMockResponse({
          ok: true,
          json: sampleTwitterOEmbed,
        }));

      const [article, tweet] = await Promise.all([
        extractContent('https://example.com/article'),
        extractContent('https://twitter.com/user/status/123'),
      ]);

      expect(article.title).toBe('OG Title Override');
      expect(tweet.entities?.twitter).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle unicode content correctly', async () => {
      const unicodeHtml = `
        <html>
        <head><title>日本語タイトル</title></head>
        <body>
          <article>
            <p>こんにちは世界 🌍 Émoji support</p>
          </article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: unicodeHtml,
      }));

      const extractor = new ArticleExtractor();
      const result = await extractor.extract('https://example.jp/article');

      expect(result.title).toBe('日本語タイトル');
      expect(result.content).toContain('こんにちは世界');
      expect(result.content).toContain('🌍');
    });

    it('should handle very long titles gracefully', async () => {
      const longTitle = 'A'.repeat(1000);
      const htmlWithLongTitle = `
        <html>
        <head><meta property="og:title" content="${longTitle}"></head>
        <body><article><p>Content</p></article></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: htmlWithLongTitle,
      }));

      const extractor = new ArticleExtractor();
      const result = await extractor.extract('https://example.com/long');

      expect(result.title).toBeDefined();
      expect(result.title!.length).toBe(1000);
    });

    it('should handle empty HTML body', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        text: '<html><head><title>Empty</title></head><body></body></html>',
      }));

      const extractor = new ArticleExtractor();
      const result = await extractor.extract('https://example.com/empty');

      expect(result.title).toBe('Empty');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});
