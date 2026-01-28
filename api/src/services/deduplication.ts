/**
 * Deduplication Service
 *
 * Orchestrates the content deduplication pipeline:
 * - Pre-ingest duplicate checking
 * - Post-process similarity scanning
 * - Merge suggestion generation
 */

import { query } from '../db/client.js';
import {
  generateFingerprints,
  storeFingerprint,
  findByUrl,
  findByTitle,
  getFingerprint,
  ContentFingerprint,
  canonicalizeUrl,
  minHashSimilarity,
} from './fingerprinting.js';
import {
  findSimilarContent,
  checkForDuplicate,
  findRelatedPages,
  SimilarityMatch,
  SIMILARITY_THRESHOLDS,
  classifyMatch,
} from './semantic-similarity.js';

/**
 * Duplicate check result
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  matchType: 'exact' | 'near' | 'related' | 'none';
  matches: DuplicateMatch[];
  recommendation: DeduplicationRecommendation;
}

export interface DuplicateMatch {
  pageSlug: string;
  pageTitle: string;
  similarityScore: number;
  matchType: 'exact' | 'near' | 'related';
  matchReasons: string[];
}

export type DeduplicationRecommendation =
  | { action: 'accept'; reason: string }
  | { action: 'reject'; reason: string; existingPage: string }
  | { action: 'review'; reason: string; candidates: string[] }
  | { action: 'merge'; reason: string; targetPage: string }
  | { action: 'link'; reason: string; relatedPages: string[] };

/**
 * Content input for deduplication check
 */
export interface ContentInput {
  content: string;
  title: string;
  sourceUrl?: string;
  slug?: string;
}

/**
 * Check content for duplicates before ingestion
 * This is the main entry point for pre-ingest checking
 */
export async function checkContentForDuplicates(
  input: ContentInput
): Promise<DuplicateCheckResult> {
  const matches: DuplicateMatch[] = [];
  let highestScore = 0;

  // 1. Check for URL duplicates first (fastest check)
  if (input.sourceUrl) {
    const urlMatches = await findByUrl(input.sourceUrl);
    for (const match of urlMatches) {
      if (match.pageSlug !== input.slug) {
        matches.push({
          pageSlug: match.pageSlug,
          pageTitle: match.titleNormalized || match.pageSlug,
          similarityScore: 1.0, // Exact URL match
          matchType: 'exact',
          matchReasons: ['Identical source URL'],
        });
        highestScore = Math.max(highestScore, 1.0);
      }
    }
  }

  // 2. Check for title duplicates
  const titleMatches = await findByTitle(input.title);
  for (const match of titleMatches) {
    if (match.pageSlug !== input.slug && !matches.some(m => m.pageSlug === match.pageSlug)) {
      matches.push({
        pageSlug: match.pageSlug,
        pageTitle: match.titleNormalized || match.pageSlug,
        similarityScore: 0.95, // Title match is very strong signal
        matchType: 'near',
        matchReasons: ['Identical normalized title'],
      });
      highestScore = Math.max(highestScore, 0.95);
    }
  }

  // 3. Check semantic similarity
  const semanticResult = await checkForDuplicate(input.content, input.title, input.sourceUrl);

  if (semanticResult.match && semanticResult.match.matchType !== 'none') {
    const existing = matches.find(m => m.pageSlug === semanticResult.match!.pageSlug);

    if (existing) {
      // Update existing match with semantic details
      existing.similarityScore = Math.max(existing.similarityScore, semanticResult.match.similarityScore);
      existing.matchReasons.push(`Semantic similarity: ${(semanticResult.match.similarityScore * 100).toFixed(1)}%`);
    } else {
      matches.push({
        pageSlug: semanticResult.match.pageSlug,
        pageTitle: semanticResult.match.pageTitle,
        similarityScore: semanticResult.match.similarityScore,
        matchType: semanticResult.match.matchType as 'exact' | 'near' | 'related',
        matchReasons: [
          `Semantic similarity: ${(semanticResult.match.similarityScore * 100).toFixed(1)}%`,
          `N-gram overlap: ${((semanticResult.match.matchDetails.ngram || 0) * 100).toFixed(1)}%`,
        ],
      });
    }

    highestScore = Math.max(highestScore, semanticResult.match.similarityScore);
  }

  // 4. Sort matches by score
  matches.sort((a, b) => b.similarityScore - a.similarityScore);

  // 5. Determine overall result
  const matchType = classifyMatch(highestScore);
  const isDuplicate = matchType === 'exact' || matchType === 'near';

  // 6. Generate recommendation
  const recommendation = generateRecommendation(matches, matchType);

  return {
    isDuplicate,
    confidence: highestScore,
    matchType,
    matches,
    recommendation,
  };
}

/**
 * Generate a recommendation based on matches
 */
function generateRecommendation(
  matches: DuplicateMatch[],
  matchType: 'exact' | 'near' | 'related' | 'none'
): DeduplicationRecommendation {
  if (matches.length === 0 || matchType === 'none') {
    return {
      action: 'accept',
      reason: 'No similar content found in the wiki',
    };
  }

  const topMatch = matches[0];

  switch (matchType) {
    case 'exact':
      return {
        action: 'reject',
        reason: `Content appears to be a duplicate of existing page "${topMatch.pageTitle}" (${(topMatch.similarityScore * 100).toFixed(1)}% match)`,
        existingPage: topMatch.pageSlug,
      };

    case 'near':
      if (matches.length === 1) {
        return {
          action: 'merge',
          reason: `Content is very similar to "${topMatch.pageTitle}" - consider merging`,
          targetPage: topMatch.pageSlug,
        };
      } else {
        return {
          action: 'review',
          reason: `Content is similar to ${matches.length} existing pages - manual review recommended`,
          candidates: matches.map(m => m.pageSlug),
        };
      }

    case 'related':
      return {
        action: 'link',
        reason: `Content is related to ${matches.length} existing page(s) - consider cross-linking`,
        relatedPages: matches.map(m => m.pageSlug),
      };

    default:
      return {
        action: 'accept',
        reason: 'No significant similarity found',
      };
  }
}

/**
 * Scan all pages for potential duplicates
 * Returns pairs of pages that might be duplicates
 */
export async function scanForDuplicates(options?: {
  threshold?: number;
  limit?: number;
}): Promise<Array<{
  page1: string;
  page2: string;
  similarity: number;
  matchType: 'exact' | 'near' | 'related';
}>> {
  const threshold = options?.threshold ?? SIMILARITY_THRESHOLDS.NEAR;
  const limit = options?.limit ?? 100;

  const duplicates: Array<{
    page1: string;
    page2: string;
    similarity: number;
    matchType: 'exact' | 'near' | 'related';
  }> = [];

  // Get all pages with content
  const pagesResult = await query<{
    slug: string;
    title: string;
    content_md: string;
  }>(`
    SELECT p.slug, p.title, pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.status = 'published'
    ORDER BY p.created_at
  `);

  const pages = pagesResult.rows;

  // Compare each page with subsequent pages
  for (let i = 0; i < pages.length && duplicates.length < limit; i++) {
    const page1 = pages[i];

    const similar = await findSimilarContent(page1.content_md, page1.title, {
      limit: 5,
      threshold,
      excludeSlugs: [page1.slug],
    });

    for (const match of similar) {
      // Avoid duplicate pairs
      const exists = duplicates.some(
        d => (d.page1 === page1.slug && d.page2 === match.pageSlug) ||
             (d.page1 === match.pageSlug && d.page2 === page1.slug)
      );

      if (!exists && match.matchType !== 'none') {
        duplicates.push({
          page1: page1.slug,
          page2: match.pageSlug,
          similarity: match.similarityScore,
          matchType: match.matchType as 'exact' | 'near' | 'related',
        });
      }
    }
  }

  // Sort by similarity
  duplicates.sort((a, b) => b.similarity - a.similarity);

  return duplicates.slice(0, limit);
}

/**
 * Generate fingerprint and store it for a page
 */
export async function indexPageForDeduplication(
  pageSlug: string,
  content: string,
  options?: {
    url?: string;
    title?: string;
  }
): Promise<ContentFingerprint> {
  const fingerprint = generateFingerprints(pageSlug, content, options);
  await storeFingerprint(fingerprint);
  return fingerprint;
}

/**
 * Get deduplication status for a page
 */
export async function getPageDeduplicationStatus(
  pageSlug: string
): Promise<{
  hasFingerprint: boolean;
  fingerprint?: ContentFingerprint;
  potentialDuplicates: DuplicateMatch[];
}> {
  const fingerprint = await getFingerprint(pageSlug);

  if (!fingerprint) {
    return {
      hasFingerprint: false,
      potentialDuplicates: [],
    };
  }

  // Get page content to check for duplicates
  const pageResult = await query<{
    title: string;
    content_md: string;
  }>(`
    SELECT p.title, pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.slug = $1
  `, [pageSlug]);

  if (pageResult.rows.length === 0) {
    return {
      hasFingerprint: true,
      fingerprint,
      potentialDuplicates: [],
    };
  }

  const { title, content_md } = pageResult.rows[0];

  const similar = await findSimilarContent(content_md, title, {
    limit: 5,
    threshold: SIMILARITY_THRESHOLDS.RELATED,
    excludeSlugs: [pageSlug],
  });

  return {
    hasFingerprint: true,
    fingerprint,
    potentialDuplicates: similar
      .filter(m => m.matchType !== 'none')
      .map(m => ({
        pageSlug: m.pageSlug,
        pageTitle: m.pageTitle,
        similarityScore: m.similarityScore,
        matchType: m.matchType as 'exact' | 'near' | 'related',
        matchReasons: [
          `Combined similarity: ${(m.similarityScore * 100).toFixed(1)}%`,
        ],
      })),
  };
}

/**
 * Backfill fingerprints for all existing pages
 */
export async function backfillFingerprints(): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ slug: string; error: string }>;
}> {
  const stats = {
    processed: 0,
    failed: 0,
    errors: [] as Array<{ slug: string; error: string }>,
  };

  // Get all published pages without fingerprints
  const pagesResult = await query<{
    slug: string;
    title: string;
    content_md: string;
  }>(`
    SELECT p.slug, p.title, pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM content_fingerprints cf
        WHERE cf.page_slug = p.slug
      )
  `);

  console.log(`Backfilling fingerprints for ${pagesResult.rows.length} pages`);

  for (const page of pagesResult.rows) {
    try {
      await indexPageForDeduplication(page.slug, page.content_md, {
        title: page.title,
      });
      stats.processed++;
      console.log(`Generated fingerprint for ${page.slug}`);
    } catch (error: any) {
      stats.failed++;
      stats.errors.push({
        slug: page.slug,
        error: error.message || 'Unknown error',
      });
      console.error(`Failed to generate fingerprint for ${page.slug}:`, error.message);
    }
  }

  return stats;
}

// Re-export key types and functions for convenience
export {
  SimilarityMatch,
  SIMILARITY_THRESHOLDS,
  findRelatedPages,
  ContentFingerprint,
};
