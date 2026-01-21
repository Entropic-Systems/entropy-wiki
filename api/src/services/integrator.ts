import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../db/client.js';
import { storeEmbedding, updatePageEmbedding } from './embeddings.js';
import { RoutingResult } from './router.js';
import { ExtractedContent, Page, PageWithContent } from '../types.js';
import { callClaude } from './claude-headless.js';

/**
 * Result of content integration
 */
export interface IntegrationResult {
  success: boolean;
  page_id: string | null;
  revision_id: string | null;
  action: 'created' | 'updated' | 'skipped';
  slug: string | null;
  title: string | null;
  error?: string;
}

/**
 * Options for content integration
 */
export interface IntegrationOptions {
  mode: 'automatic' | 'review';
  sourceUrl?: string;
  sourceAttribution?: string;
}

/**
 * Create a new wiki page from extracted content
 * Uses Claude to generate wiki-formatted content
 */
export async function createNewPage(
  content: ExtractedContent,
  routing: RoutingResult,
  options: IntegrationOptions
): Promise<IntegrationResult> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Generate wiki-formatted content
    const wikiContent = await generateWikiContent(content, options);

    // Determine slug and title
    const slug = routing.suggested_slug || generateSlug(content.title || 'untitled');
    const title = routing.suggested_title || content.title || 'Untitled Page';

    // Ensure slug is unique
    const uniqueSlug = await ensureUniqueSlug(slug, client);

    // Create page and revision
    const pageId = uuidv4();
    const revisionId = uuidv4();
    const status = options.mode === 'automatic' ? 'published' : 'draft';

    // Create the page
    await client.query(`
      INSERT INTO pages (id, slug, title, status)
      VALUES ($1, $2, $3, $4)
    `, [pageId, uniqueSlug, title, status]);

    // Create the revision (author_type='ai' for ingested content)
    await client.query(`
      INSERT INTO page_revisions (id, page_id, content_md, author_type)
      VALUES ($1, $2, $3, 'ai')
    `, [revisionId, pageId, wikiContent]);

    // Update page with revision references
    const publishedRevId = status === 'published' ? revisionId : null;
    const draftRevId = status === 'draft' ? revisionId : null;

    await client.query(`
      UPDATE pages
      SET current_published_revision_id = $1, current_draft_revision_id = $2
      WHERE id = $3
    `, [publishedRevId, draftRevId, pageId]);

    await client.query('COMMIT');

    // Store embedding for the new page (outside transaction)
    if (status === 'published') {
      try {
        await storeEmbedding(pageId, revisionId, wikiContent);
      } catch (error) {
        console.warn('Failed to store embedding:', error);
        // Don't fail the integration for embedding errors
      }
    }

    return {
      success: true,
      page_id: pageId,
      revision_id: revisionId,
      action: 'created',
      slug: uniqueSlug,
      title,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating new page:', error);

    if (error.code === '23505') { // unique violation
      return {
        success: false,
        page_id: null,
        revision_id: null,
        action: 'skipped',
        slug: null,
        title: null,
        error: 'A page with this slug already exists',
      };
    }

    return {
      success: false,
      page_id: null,
      revision_id: null,
      action: 'skipped',
      slug: null,
      title: null,
      error: error.message || 'Unknown error',
    };
  } finally {
    client.release();
  }
}

/**
 * Enhance an existing wiki page with new content
 * Uses Claude to intelligently merge content
 */
export async function enhanceExistingPage(
  content: ExtractedContent,
  routing: RoutingResult,
  options: IntegrationOptions
): Promise<IntegrationResult> {
  if (!routing.target_page_id) {
    return {
      success: false,
      page_id: null,
      revision_id: null,
      action: 'skipped',
      slug: null,
      title: null,
      error: 'No target page specified for enhancement',
    };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Fetch existing page and content
    const existingResult = await client.query<PageWithContent>(`
      SELECT p.id, p.slug, p.title, p.status,
             p.current_published_revision_id, p.current_draft_revision_id,
             pr.content_md
      FROM pages p
      LEFT JOIN page_revisions pr ON
        pr.id = COALESCE(p.current_draft_revision_id, p.current_published_revision_id)
      WHERE p.id = $1
    `, [routing.target_page_id]);

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        page_id: null,
        revision_id: null,
        action: 'skipped',
        slug: null,
        title: null,
        error: 'Target page not found',
      };
    }

    const existingPage = existingResult.rows[0];
    const existingContent = existingPage.content_md || '';

    // Merge content using AI
    const mergedContent = await mergeContent(
      existingContent,
      content,
      routing,
      options
    );

    // Create new revision
    const revisionId = uuidv4();

    await client.query(`
      INSERT INTO page_revisions (id, page_id, content_md, author_type)
      VALUES ($1, $2, $3, 'ai')
    `, [revisionId, routing.target_page_id, mergedContent]);

    // Update page with new revision
    // In review mode, update draft; in automatic mode, update both
    if (options.mode === 'review') {
      await client.query(`
        UPDATE pages
        SET current_draft_revision_id = $1
        WHERE id = $2
      `, [revisionId, routing.target_page_id]);
    } else {
      await client.query(`
        UPDATE pages
        SET current_published_revision_id = $1,
            current_draft_revision_id = NULL,
            status = 'published'
        WHERE id = $2
      `, [revisionId, routing.target_page_id]);
    }

    await client.query('COMMIT');

    // Update embedding for the page (outside transaction)
    if (options.mode === 'automatic') {
      try {
        await updatePageEmbedding(routing.target_page_id);
      } catch (error) {
        console.warn('Failed to update embedding:', error);
      }
    }

    return {
      success: true,
      page_id: routing.target_page_id,
      revision_id: revisionId,
      action: 'updated',
      slug: existingPage.slug,
      title: existingPage.title,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error enhancing page:', error);

    return {
      success: false,
      page_id: routing.target_page_id,
      revision_id: null,
      action: 'skipped',
      slug: null,
      title: null,
      error: error.message || 'Unknown error',
    };
  } finally {
    client.release();
  }
}

/**
 * Generate wiki-formatted content from extracted content
 */
async function generateWikiContent(
  content: ExtractedContent,
  options: IntegrationOptions
): Promise<string> {
  const attribution = options.sourceUrl
    ? `\n\n---\n*Source: [${options.sourceAttribution || options.sourceUrl}](${options.sourceUrl})*`
    : '';

  const prompt = `Convert the following content into a well-structured wiki page in Markdown format.

## Input Content

**Title:** ${content.title || 'Untitled'}
**Topics:** ${content.topics?.join(', ') || 'None'}

**Summary:**
${content.summary || 'No summary available'}

**Content:**
${content.content || 'No content available'}

## Requirements

1. Create a clean, well-organized wiki page
2. Use proper Markdown headings (##, ###) to structure the content
3. Keep important information, remove fluff
4. Add a brief introduction if needed
5. Use bullet points or numbered lists where appropriate
6. Preserve any code blocks or technical content
7. Keep the tone informative and neutral
8. Do NOT add a top-level heading (# Title) - that will be added automatically

## Output

Return ONLY the Markdown content, no explanations or meta-commentary.`;

  try {
    const responseText = await callClaude(prompt, { extractJson: false });

    return responseText.trim() + attribution;
  } catch (error: any) {
    console.error('Error generating wiki content:', error);
    // Fallback: use extracted content directly
    return formatFallbackContent(content, options);
  }
}

/**
 * Merge new content into existing page content
 */
async function mergeContent(
  existingContent: string,
  newContent: ExtractedContent,
  routing: RoutingResult,
  options: IntegrationOptions
): Promise<string> {
  const attribution = options.sourceUrl
    ? `\n\n*Source: [${options.sourceAttribution || options.sourceUrl}](${options.sourceUrl})*`
    : '';

  const sectionContext = routing.target_section
    ? `Add the new content to the "${routing.target_section}" section.`
    : 'Add the new content to the most appropriate section.';

  const prompt = `Merge new content into an existing wiki page, preserving structure and avoiding duplication.

## Existing Wiki Page

${existingContent}

## New Content to Integrate

**Title:** ${newContent.title || 'Untitled'}
**Summary:** ${newContent.summary || 'No summary'}

**Content:**
${newContent.content || 'No content'}

## Instructions

1. ${sectionContext}
2. Preserve the existing page structure and formatting
3. Integrate the new information naturally
4. Avoid duplicating existing content
5. Add source attribution for the new content: ${attribution || '(no attribution needed)'}
6. Keep the merged content cohesive and well-organized

## Output

Return ONLY the complete merged Markdown content of the page.`;

  try {
    const responseText = await callClaude(prompt, { extractJson: false });

    return responseText.trim();
  } catch (error: any) {
    console.error('Error merging content:', error);
    // Fallback: append new content at the end
    return existingContent + '\n\n---\n\n## Additional Information\n\n' +
      formatFallbackContent(newContent, options);
  }
}

/**
 * Format content as fallback when AI is unavailable
 */
function formatFallbackContent(
  content: ExtractedContent,
  options: IntegrationOptions
): string {
  const parts: string[] = [];

  if (content.summary) {
    parts.push(content.summary + '\n');
  }

  if (content.content) {
    parts.push(content.content);
  }

  if (content.topics && content.topics.length > 0) {
    parts.push('\n**Topics:** ' + content.topics.join(', '));
  }

  if (options.sourceUrl) {
    parts.push(`\n\n---\n*Source: [${options.sourceAttribution || options.sourceUrl}](${options.sourceUrl})*`);
  }

  return parts.join('\n');
}

/**
 * Generate a URL-friendly slug
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Ensure slug is unique by appending a number if needed
 */
async function ensureUniqueSlug(
  baseSlug: string,
  client: any
): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const result = await client.query(
      'SELECT 1 FROM pages WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return slug;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;

    // Safety limit
    if (counter > 100) {
      slug = `${baseSlug}-${Date.now()}`;
      return slug;
    }
  }
}

/**
 * Main integration function - routes to appropriate action
 */
export async function integrateContent(
  content: ExtractedContent,
  routing: RoutingResult,
  options: IntegrationOptions
): Promise<IntegrationResult> {
  switch (routing.decision) {
    case 'new_page':
      return createNewPage(content, routing, options);

    case 'update_page':
    case 'append_section':
    case 'merge':
      return enhanceExistingPage(content, routing, options);

    case 'skip':
      return {
        success: true,
        page_id: routing.target_page_id,
        revision_id: null,
        action: 'skipped',
        slug: null,
        title: null,
        error: routing.reasoning || 'Content skipped',
      };

    default:
      return {
        success: false,
        page_id: null,
        revision_id: null,
        action: 'skipped',
        slug: null,
        title: null,
        error: `Unknown routing decision: ${routing.decision}`,
      };
  }
}
