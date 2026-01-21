import { findPagesForRouting, findSimilarPages } from './embeddings.js';
import { RoutingDecision, RoutingDecisionType, ExtractedContent, SimilaritySearchResult } from '../types.js';
import { callClaude } from './claude-headless.js';

/**
 * Routing decision with additional metadata for the decision
 */
export interface RoutingResult {
  decision: RoutingDecisionType;
  target_page_id: string | null;
  target_section: string | null;
  reasoning: string;
  suggested_slug: string | null;
  suggested_title: string | null;
  confidence: number;
  similar_pages: SimilaritySearchResult[];
}

/**
 * Find similar pages for routing decisions
 * Returns top candidates with similarity scores
 */
export async function findCandidatePages(
  content: string,
  limit: number = 5
): Promise<SimilaritySearchResult[]> {
  // Use the embedding service to find similar pages
  return findPagesForRouting(content, limit);
}

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Make a routing decision using AI
 * Two-stage process: semantic similarity + AI decision
 */
export async function makeRoutingDecision(
  extractedContent: ExtractedContent,
  sourceUrl?: string
): Promise<RoutingResult> {
  // Stage 1: Find similar pages using embeddings
  const searchContent = [
    extractedContent.title || '',
    extractedContent.summary || '',
    extractedContent.content?.slice(0, 2000) || '', // First 2000 chars for similarity
  ].join('\n\n');

  let similarPages: SimilaritySearchResult[] = [];
  try {
    similarPages = await findCandidatePages(searchContent);
  } catch (error) {
    console.warn('Could not find similar pages:', error);
    // Continue without similarity results
  }

  // Stage 2: Use AI to make routing decision
  const prompt = buildRoutingPrompt(extractedContent, similarPages, sourceUrl);

  try {
    const responseText = await callClaude(prompt, { extractJson: true });

    return parseRoutingResponse(responseText, similarPages);
  } catch (error: any) {
    console.error('AI routing error:', error.message);

    // Fallback: if we have highly similar pages, suggest merge; otherwise new page
    if (similarPages.length > 0 && similarPages[0].similarity > 0.8) {
      return {
        decision: 'update_page',
        target_page_id: similarPages[0].page_id,
        target_section: null,
        reasoning: 'AI unavailable, but found highly similar page',
        suggested_slug: null,
        suggested_title: null,
        confidence: 0.6,
        similar_pages: similarPages,
      };
    }

    return {
      decision: 'new_page',
      target_page_id: null,
      target_section: null,
      reasoning: 'AI unavailable, defaulting to new page',
      suggested_slug: extractedContent.title ? generateSlug(extractedContent.title) : null,
      suggested_title: extractedContent.title,
      confidence: 0.4,
      similar_pages: similarPages,
    };
  }
}

/**
 * Build the routing prompt for the AI
 */
function buildRoutingPrompt(
  content: ExtractedContent,
  similarPages: SimilaritySearchResult[],
  sourceUrl?: string
): string {
  const similarPagesSection = similarPages.length > 0
    ? `
## Similar Existing Pages

${similarPages.map((p, i) => `${i + 1}. **${p.page_title}** (/${p.page_slug})
   - Similarity: ${(p.similarity * 100).toFixed(1)}%
   - Preview: ${p.chunk_text?.slice(0, 150) || 'No preview'}...`).join('\n\n')}
`
    : '\n## Similar Existing Pages\n\nNo similar pages found in the wiki.\n';

  return `You are a content routing system for a wiki. Your task is to decide how to integrate new content.

## New Content to Integrate

**Title:** ${content.title || 'Untitled'}
${sourceUrl ? `**Source:** ${sourceUrl}` : ''}
**Topics:** ${content.topics?.join(', ') || 'None detected'}

**Summary:**
${content.summary || 'No summary available'}

**Content Preview:**
${content.content?.slice(0, 1000) || 'No content available'}...

${similarPagesSection}

## Your Task

Decide how to integrate this content. Choose ONE action:

1. **new_page** - Create a brand new page (when topic is novel or sufficiently distinct)
2. **update_page** - Replace/update an existing page (when content is a newer version)
3. **append_section** - Add as a new section to an existing page (when content expands a topic)
4. **merge** - Merge with existing content (when content overlaps significantly)
5. **skip** - Skip this content (when it's duplicate, spam, or not valuable)

## Response Format

Respond with JSON only, no other text:

{
  "decision": "new_page|update_page|append_section|merge|skip",
  "target_page_id": "uuid-if-updating-or-null",
  "target_section": "section-name-if-appending-or-null",
  "reasoning": "Brief explanation of your decision",
  "suggested_slug": "url-slug-for-new-pages-or-null",
  "suggested_title": "title-for-new-pages-or-null",
  "confidence": 0.0-1.0
}`;
}

/**
 * Parse the AI response into a RoutingResult
 */
function parseRoutingResponse(
  response: string,
  similarPages: SimilaritySearchResult[]
): RoutingResult {
  try {
    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    // Validate and normalize decision
    const validDecisions: RoutingDecisionType[] = ['new_page', 'update_page', 'append_section', 'merge', 'skip'];
    const decision = validDecisions.includes(parsed.decision)
      ? parsed.decision
      : 'new_page';

    // Find target page if specified
    let targetPageId: string | null = null;
    if (parsed.target_page_id) {
      targetPageId = parsed.target_page_id;
    } else if (['update_page', 'append_section', 'merge'].includes(decision) && similarPages.length > 0) {
      // If decision requires a target but none specified, use best match
      targetPageId = similarPages[0].page_id;
    }

    return {
      decision,
      target_page_id: targetPageId,
      target_section: parsed.target_section || null,
      reasoning: parsed.reasoning || 'No reasoning provided',
      suggested_slug: parsed.suggested_slug || null,
      suggested_title: parsed.suggested_title || null,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7,
      similar_pages: similarPages,
    };
  } catch (error) {
    console.error('Failed to parse routing response:', error);
    console.error('Response was:', response);

    // Fallback
    return {
      decision: 'new_page',
      target_page_id: null,
      target_section: null,
      reasoning: 'Failed to parse AI response, defaulting to new page',
      suggested_slug: null,
      suggested_title: null,
      confidence: 0.3,
      similar_pages: similarPages,
    };
  }
}

/**
 * Quick routing decision for simple cases (no AI call)
 * Use when content type clearly indicates action
 */
export function quickRouteDecision(
  content: ExtractedContent,
  similarPages: SimilaritySearchResult[]
): RoutingResult | null {
  // Skip if extraction failed
  if (!content.content && !content.summary) {
    return {
      decision: 'skip',
      target_page_id: null,
      target_section: null,
      reasoning: 'Content extraction failed',
      suggested_slug: null,
      suggested_title: null,
      confidence: 1.0,
      similar_pages: similarPages,
    };
  }

  // Very high similarity (>95%) suggests duplicate
  if (similarPages.length > 0 && similarPages[0].similarity > 0.95) {
    return {
      decision: 'skip',
      target_page_id: similarPages[0].page_id,
      target_section: null,
      reasoning: 'Content appears to be a duplicate of existing page',
      suggested_slug: null,
      suggested_title: null,
      confidence: 0.9,
      similar_pages: similarPages,
    };
  }

  // No quick decision possible, need AI
  return null;
}

/**
 * Full routing pipeline: quick check + AI if needed
 */
export async function routeContent(
  extractedContent: ExtractedContent,
  sourceUrl?: string
): Promise<RoutingResult> {
  // Stage 1: Find similar pages
  const searchContent = [
    extractedContent.title || '',
    extractedContent.summary || '',
    extractedContent.content?.slice(0, 2000) || '',
  ].join('\n\n');

  let similarPages: SimilaritySearchResult[] = [];
  try {
    similarPages = await findSimilarPages(searchContent, 5, 0.2);
  } catch (error) {
    console.warn('Similarity search failed:', error);
  }

  // Stage 2: Try quick routing
  const quickResult = quickRouteDecision(extractedContent, similarPages);
  if (quickResult) {
    return quickResult;
  }

  // Stage 3: AI routing
  return makeRoutingDecision(extractedContent, sourceUrl);
}
