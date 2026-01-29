/**
 * Hybrid Scorer Service
 *
 * Combines vector and full-text search results using:
 * - Reciprocal Rank Fusion (RRF)
 * - Configurable weights
 * - Result deduplication
 * - Score normalization
 */

import { VectorSearchResult } from './vector-search.js';
import { FulltextSearchResult } from './fulltext-search.js';

/**
 * Combined search result
 */
export interface HybridSearchResult {
  pageSlug: string;
  pageTitle: string;
  pageId: string;
  score: number;
  vectorScore?: number;
  fulltextScore?: number;
  vectorRank?: number;
  fulltextRank?: number;
  headline?: string;
  matchSources: ('semantic' | 'fulltext')[];
}

/**
 * Hybrid scoring configuration
 */
export interface HybridScoringConfig {
  // Weight for vector (semantic) results (0-1)
  vectorWeight: number;
  // Weight for fulltext results (0-1)
  fulltextWeight: number;
  // RRF constant (typically 60)
  rrfK: number;
  // Minimum score threshold for final results
  minScore: number;
  // Boost for results appearing in both searches
  overlapBoost: number;
}

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: HybridScoringConfig = {
  vectorWeight: 0.6,
  fulltextWeight: 0.4,
  rrfK: 60,
  minScore: 0.01,
  overlapBoost: 1.2,
};

/**
 * Calculate Reciprocal Rank Fusion score
 * RRF(d) = sum(1 / (k + rank(d)))
 */
export function calculateRRFScore(rank: number, k: number = 60): number {
  return 1 / (k + rank);
}

/**
 * Normalize scores to 0-1 range
 */
export function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min;

  if (range === 0) {
    return scores.map(() => 1);
  }

  return scores.map(s => (s - min) / range);
}

/**
 * Merge and score vector and fulltext results using hybrid approach
 */
export function hybridMerge(
  vectorResults: VectorSearchResult[],
  fulltextResults: FulltextSearchResult[],
  config: Partial<HybridScoringConfig> = {}
): HybridSearchResult[] {
  const cfg = { ...DEFAULT_SCORING_CONFIG, ...config };

  // Create lookup maps
  const resultMap = new Map<string, HybridSearchResult>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    const rrfScore = calculateRRFScore(index + 1, cfg.rrfK);
    const normalizedSimilarity = result.similarity; // Already 0-1

    const existing = resultMap.get(result.pageSlug);
    if (existing) {
      // Update existing entry
      existing.vectorScore = normalizedSimilarity;
      existing.vectorRank = index + 1;
      existing.matchSources.push('semantic');
    } else {
      // Create new entry
      resultMap.set(result.pageSlug, {
        pageSlug: result.pageSlug,
        pageTitle: result.pageTitle,
        pageId: result.pageId,
        score: 0, // Will be calculated
        vectorScore: normalizedSimilarity,
        vectorRank: index + 1,
        matchSources: ['semantic'],
      });
    }
  });

  // Process fulltext results
  fulltextResults.forEach((result, index) => {
    const rrfScore = calculateRRFScore(index + 1, cfg.rrfK);

    const existing = resultMap.get(result.pageSlug);
    if (existing) {
      // Update existing entry
      existing.fulltextScore = result.rank;
      existing.fulltextRank = index + 1;
      existing.headline = result.headline;
      if (!existing.matchSources.includes('fulltext')) {
        existing.matchSources.push('fulltext');
      }
    } else {
      // Create new entry
      resultMap.set(result.pageSlug, {
        pageSlug: result.pageSlug,
        pageTitle: result.pageTitle,
        pageId: result.pageId,
        score: 0,
        fulltextScore: result.rank,
        fulltextRank: index + 1,
        headline: result.headline,
        matchSources: ['fulltext'],
      });
    }
  });

  // Normalize fulltext scores across all results
  const allFulltextScores = Array.from(resultMap.values())
    .filter(r => r.fulltextScore !== undefined)
    .map(r => r.fulltextScore!);

  if (allFulltextScores.length > 0) {
    const maxFulltext = Math.max(...allFulltextScores);
    if (maxFulltext > 0) {
      for (const result of resultMap.values()) {
        if (result.fulltextScore !== undefined) {
          result.fulltextScore = result.fulltextScore / maxFulltext;
        }
      }
    }
  }

  // Calculate final scores
  for (const result of resultMap.values()) {
    let score = 0;

    // RRF-based scoring
    if (result.vectorRank !== undefined) {
      score += cfg.vectorWeight * calculateRRFScore(result.vectorRank, cfg.rrfK);
    }
    if (result.fulltextRank !== undefined) {
      score += cfg.fulltextWeight * calculateRRFScore(result.fulltextRank, cfg.rrfK);
    }

    // Apply overlap boost if result appears in both searches
    if (result.matchSources.length > 1) {
      score *= cfg.overlapBoost;
    }

    result.score = score;
  }

  // Filter and sort results
  const results = Array.from(resultMap.values())
    .filter(r => r.score >= cfg.minScore)
    .sort((a, b) => b.score - a.score);

  // Normalize final scores for better UX
  if (results.length > 0) {
    const maxScore = results[0].score;
    for (const result of results) {
      result.score = result.score / maxScore;
    }
  }

  return results;
}

/**
 * Apply score-based weighting (alternative to RRF)
 * Uses actual similarity/rank scores instead of ranks
 */
export function scoreBasedMerge(
  vectorResults: VectorSearchResult[],
  fulltextResults: FulltextSearchResult[],
  config: Partial<HybridScoringConfig> = {}
): HybridSearchResult[] {
  const cfg = { ...DEFAULT_SCORING_CONFIG, ...config };

  const resultMap = new Map<string, HybridSearchResult>();

  // Normalize fulltext scores
  const maxFulltextRank = Math.max(...fulltextResults.map(r => r.rank), 0.001);

  // Process vector results
  for (const result of vectorResults) {
    resultMap.set(result.pageSlug, {
      pageSlug: result.pageSlug,
      pageTitle: result.pageTitle,
      pageId: result.pageId,
      score: result.similarity * cfg.vectorWeight,
      vectorScore: result.similarity,
      matchSources: ['semantic'],
    });
  }

  // Process fulltext results
  for (const result of fulltextResults) {
    const normalizedRank = result.rank / maxFulltextRank;
    const existing = resultMap.get(result.pageSlug);

    if (existing) {
      existing.fulltextScore = normalizedRank;
      existing.score += normalizedRank * cfg.fulltextWeight;
      existing.score *= cfg.overlapBoost; // Boost overlapping results
      existing.headline = result.headline;
      existing.matchSources.push('fulltext');
    } else {
      resultMap.set(result.pageSlug, {
        pageSlug: result.pageSlug,
        pageTitle: result.pageTitle,
        pageId: result.pageId,
        score: normalizedRank * cfg.fulltextWeight,
        fulltextScore: normalizedRank,
        headline: result.headline,
        matchSources: ['fulltext'],
      });
    }
  }

  // Sort and filter
  const results = Array.from(resultMap.values())
    .filter(r => r.score >= cfg.minScore)
    .sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Re-rank results based on additional signals
 */
export function rerank(
  results: HybridSearchResult[],
  signals: {
    recencyBoost?: Map<string, number>; // slug -> boost factor
    popularityBoost?: Map<string, number>;
    categoryRelevance?: Map<string, number>;
  }
): HybridSearchResult[] {
  return results.map(result => {
    let score = result.score;

    // Apply recency boost
    if (signals.recencyBoost?.has(result.pageSlug)) {
      score *= signals.recencyBoost.get(result.pageSlug)!;
    }

    // Apply popularity boost
    if (signals.popularityBoost?.has(result.pageSlug)) {
      score *= signals.popularityBoost.get(result.pageSlug)!;
    }

    // Apply category relevance boost
    if (signals.categoryRelevance?.has(result.pageSlug)) {
      score *= signals.categoryRelevance.get(result.pageSlug)!;
    }

    return { ...result, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Diversify results to avoid too many similar pages
 */
export function diversifyResults(
  results: HybridSearchResult[],
  maxPerCategory: number = 3
): HybridSearchResult[] {
  // This would need category information to properly diversify
  // For now, just ensure unique slugs (which should already be the case)
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.pageSlug)) return false;
    seen.add(r.pageSlug);
    return true;
  });
}

/**
 * Explain why a result ranked where it did
 */
export function explainRanking(result: HybridSearchResult): string {
  const parts: string[] = [];

  parts.push(`Final score: ${(result.score * 100).toFixed(1)}%`);

  if (result.vectorScore !== undefined) {
    parts.push(`Semantic similarity: ${(result.vectorScore * 100).toFixed(1)}%`);
  }

  if (result.fulltextScore !== undefined) {
    parts.push(`Keyword match: ${(result.fulltextScore * 100).toFixed(1)}%`);
  }

  if (result.matchSources.length > 1) {
    parts.push('Boosted: found in both semantic and keyword search');
  }

  return parts.join(' | ');
}
