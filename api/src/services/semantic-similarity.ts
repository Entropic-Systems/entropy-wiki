/**
 * Semantic Similarity Service
 *
 * Uses embeddings for semantic content comparison:
 * - Vector similarity using pgvector
 * - Title/heading comparison
 * - N-gram overlap analysis
 */

import { query } from '../db/client.js';
import { generateEmbedding, findSimilarPages } from './embeddings.js';
import {
  generateNgrams,
  normalizeTitle,
  minHashSimilarity,
  generateMinHashSignature,
} from './fingerprinting.js';

/**
 * Similarity match result
 */
export interface SimilarityMatch {
  pageSlug: string;
  pageTitle: string;
  similarityScore: number;
  matchType: 'exact' | 'near' | 'related' | 'none';
  matchDetails: {
    semantic?: number;
    ngram?: number;
    title?: number;
  };
}

/**
 * Thresholds for similarity classification
 */
export const SIMILARITY_THRESHOLDS = {
  EXACT: 0.98,    // Near-identical content
  NEAR: 0.90,     // Very similar, likely duplicates
  RELATED: 0.75,  // Related content, worth linking
  MINIMUM: 0.50,  // Minimum for consideration
} as const;

/**
 * Classify similarity score into match type
 */
export function classifyMatch(score: number): SimilarityMatch['matchType'] {
  if (score >= SIMILARITY_THRESHOLDS.EXACT) return 'exact';
  if (score >= SIMILARITY_THRESHOLDS.NEAR) return 'near';
  if (score >= SIMILARITY_THRESHOLDS.RELATED) return 'related';
  return 'none';
}

/**
 * Calculate semantic similarity using embeddings
 */
export async function calculateSemanticSimilarity(
  content: string,
  targetContent: string
): Promise<number> {
  try {
    const [embedding1, embedding2] = await Promise.all([
      generateEmbedding(content),
      generateEmbedding(targetContent),
    ]);

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.warn('Semantic similarity calculation failed:', error);
    return 0;
  }
}

/**
 * Calculate n-gram overlap similarity
 */
export function calculateNgramSimilarity(content1: string, content2: string): number {
  const ngrams1 = new Set(generateNgrams(content1));
  const ngrams2 = new Set(generateNgrams(content2));

  if (ngrams1.size === 0 || ngrams2.size === 0) return 0;

  let intersection = 0;
  for (const ngram of ngrams1) {
    if (ngrams2.has(ngram)) intersection++;
  }

  const union = ngrams1.size + ngrams2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate title similarity using normalized Levenshtein distance
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  if (norm1 === norm2) return 1;
  if (norm1.length === 0 || norm2.length === 0) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= norm1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= norm2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= norm1.length; i++) {
    for (let j = 1; j <= norm2.length; j++) {
      const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[norm1.length][norm2.length];
  const maxLength = Math.max(norm1.length, norm2.length);

  return 1 - (distance / maxLength);
}

/**
 * Calculate combined similarity score with weighted components
 */
export function calculateCombinedSimilarity(
  semantic: number,
  ngram: number,
  title: number
): number {
  // Weights for each component
  const weights = {
    semantic: 0.50,  // Embedding similarity is most important
    ngram: 0.30,     // N-gram overlap catches structural similarity
    title: 0.20,     // Title similarity helps with exact matches
  };

  return (
    semantic * weights.semantic +
    ngram * weights.ngram +
    title * weights.title
  );
}

/**
 * Find similar content in the wiki using multiple signals
 */
export async function findSimilarContent(
  content: string,
  title: string,
  options?: {
    limit?: number;
    threshold?: number;
    excludeSlugs?: string[];
  }
): Promise<SimilarityMatch[]> {
  const limit = options?.limit ?? 10;
  const threshold = options?.threshold ?? SIMILARITY_THRESHOLDS.MINIMUM;
  const excludeSlugs = new Set(options?.excludeSlugs ?? []);

  const matches: SimilarityMatch[] = [];

  try {
    // Use embedding search to find candidate pages
    const semanticMatches = await findSimilarPages(content, limit * 2, 0.3);

    // Get content for each match to calculate additional similarity metrics
    for (const match of semanticMatches) {
      if (excludeSlugs.has(match.page_slug)) continue;

      // Get page content
      const pageResult = await query<{
        content_md: string;
        title: string;
      }>(`
        SELECT pr.content_md, p.title
        FROM pages p
        JOIN page_revisions pr ON p.current_published_revision_id = pr.id
        WHERE p.slug = $1
      `, [match.page_slug]);

      if (pageResult.rows.length === 0) continue;

      const targetContent = pageResult.rows[0].content_md;
      const targetTitle = pageResult.rows[0].title;

      // Calculate all similarity metrics
      const semanticScore = match.similarity;
      const ngramScore = calculateNgramSimilarity(content, targetContent);
      const titleScore = calculateTitleSimilarity(title, targetTitle);

      const combinedScore = calculateCombinedSimilarity(
        semanticScore,
        ngramScore,
        titleScore
      );

      if (combinedScore >= threshold) {
        matches.push({
          pageSlug: match.page_slug,
          pageTitle: targetTitle,
          similarityScore: combinedScore,
          matchType: classifyMatch(combinedScore),
          matchDetails: {
            semantic: semanticScore,
            ngram: ngramScore,
            title: titleScore,
          },
        });
      }
    }

    // Sort by similarity score
    matches.sort((a, b) => b.similarityScore - a.similarityScore);

    return matches.slice(0, limit);
  } catch (error) {
    console.error('Error finding similar content:', error);
    return [];
  }
}

/**
 * Check if content is a duplicate of existing page
 */
export async function checkForDuplicate(
  content: string,
  title: string,
  sourceUrl?: string
): Promise<{
  isDuplicate: boolean;
  matchType: SimilarityMatch['matchType'];
  match?: SimilarityMatch;
  recommendation: 'reject' | 'review' | 'merge' | 'link' | 'accept';
}> {
  const matches = await findSimilarContent(content, title, {
    limit: 1,
    threshold: SIMILARITY_THRESHOLDS.RELATED,
  });

  if (matches.length === 0) {
    return {
      isDuplicate: false,
      matchType: 'none',
      recommendation: 'accept',
    };
  }

  const topMatch = matches[0];

  // Determine recommendation based on match type
  let recommendation: 'reject' | 'review' | 'merge' | 'link' | 'accept';

  switch (topMatch.matchType) {
    case 'exact':
      recommendation = 'reject';
      break;
    case 'near':
      recommendation = 'review';
      break;
    case 'related':
      recommendation = 'link';
      break;
    default:
      recommendation = 'accept';
  }

  return {
    isDuplicate: topMatch.matchType === 'exact' || topMatch.matchType === 'near',
    matchType: topMatch.matchType,
    match: topMatch,
    recommendation,
  };
}

/**
 * Find all pages related to the given content
 * Returns pages that should be cross-linked
 */
export async function findRelatedPages(
  content: string,
  title: string,
  currentSlug?: string
): Promise<SimilarityMatch[]> {
  const excludeSlugs = currentSlug ? [currentSlug] : [];

  return findSimilarContent(content, title, {
    limit: 5,
    threshold: SIMILARITY_THRESHOLDS.RELATED,
    excludeSlugs,
  });
}

/**
 * Get similarity score between two existing pages
 */
export async function getPageSimilarity(
  slug1: string,
  slug2: string
): Promise<SimilarityMatch | null> {
  // Get both pages' content
  const result = await query<{
    slug: string;
    title: string;
    content_md: string;
  }>(`
    SELECT p.slug, p.title, pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.slug IN ($1, $2)
  `, [slug1, slug2]);

  if (result.rows.length !== 2) return null;

  const page1 = result.rows.find(r => r.slug === slug1)!;
  const page2 = result.rows.find(r => r.slug === slug2)!;

  const [semanticScore, ngramScore] = await Promise.all([
    calculateSemanticSimilarity(page1.content_md, page2.content_md),
    Promise.resolve(calculateNgramSimilarity(page1.content_md, page2.content_md)),
  ]);

  const titleScore = calculateTitleSimilarity(page1.title, page2.title);
  const combinedScore = calculateCombinedSimilarity(semanticScore, ngramScore, titleScore);

  return {
    pageSlug: slug2,
    pageTitle: page2.title,
    similarityScore: combinedScore,
    matchType: classifyMatch(combinedScore),
    matchDetails: {
      semantic: semanticScore,
      ngram: ngramScore,
      title: titleScore,
    },
  };
}
