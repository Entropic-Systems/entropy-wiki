/**
 * Search Service - Main Entry Point
 *
 * Orchestrates the hybrid search pipeline:
 * Query → Processing → Vector + Fulltext → Fusion → Results
 */

import {
  processQuery,
  ProcessedQuery,
  QueryIntent,
  extractTerms,
  generateSuggestions,
} from './query-processor.js';
import {
  vectorSearch,
  expandedVectorSearch,
  VectorSearchResult,
  VectorSearchOptions,
  logSearchQuery,
} from './vector-search.js';
import {
  fulltextSearch,
  autocompleteSearch,
  getSearchSuggestions,
  countSearchResults,
  FulltextSearchResult,
  FulltextSearchOptions,
} from './fulltext-search.js';
import {
  hybridMerge,
  HybridSearchResult,
  HybridScoringConfig,
  DEFAULT_SCORING_CONFIG,
  rerank,
  explainRanking,
} from './hybrid-scorer.js';

/**
 * Main search options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  categoryFilter?: string[];
  excludeSlugs?: string[];
  includeExplanation?: boolean;
  sessionId?: string;
  // Search mode override
  mode?: 'hybrid' | 'vector' | 'fulltext';
  // Scoring configuration
  scoringConfig?: Partial<HybridScoringConfig>;
}

/**
 * Search response
 */
export interface SearchResponse {
  results: HybridSearchResult[];
  query: ProcessedQuery;
  totalCount: number;
  searchTime: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Default search options
 */
const DEFAULT_SEARCH_OPTIONS: Required<Omit<SearchOptions, 'sessionId' | 'scoringConfig'>> = {
  limit: 20,
  offset: 0,
  categoryFilter: [],
  excludeSlugs: [],
  includeExplanation: false,
  mode: 'hybrid',
};

/**
 * Main search function
 */
export async function search(
  queryString: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

  // Process the query
  const processedQuery = processQuery(queryString);

  // Determine search strategy based on query and options
  const useVector = opts.mode === 'hybrid'
    ? processedQuery.shouldUseVector
    : opts.mode === 'vector';
  const useFulltext = opts.mode === 'hybrid'
    ? processedQuery.shouldUseFulltext
    : opts.mode === 'fulltext';

  // Prepare common options
  const searchOpts = {
    limit: opts.limit * 2, // Get more candidates for fusion
    categoryFilter: opts.categoryFilter,
    excludeSlugs: opts.excludeSlugs,
  };

  // Execute searches in parallel
  const [vectorResults, fulltextResults] = await Promise.all([
    useVector
      ? expandedVectorSearch(queryString, processedQuery.expandedTerms, searchOpts)
      : Promise.resolve([]),
    useFulltext
      ? fulltextSearch(extractTerms(queryString), {
          ...searchOpts,
          includeHeadline: true,
        })
      : Promise.resolve([]),
  ]);

  // Merge results
  let results: HybridSearchResult[];

  if (opts.mode === 'vector') {
    // Vector-only mode
    results = vectorResults.map(r => ({
      pageSlug: r.pageSlug,
      pageTitle: r.pageTitle,
      pageId: r.pageId,
      score: r.similarity,
      vectorScore: r.similarity,
      matchSources: ['semantic'] as const,
    }));
  } else if (opts.mode === 'fulltext') {
    // Fulltext-only mode
    const maxRank = Math.max(...fulltextResults.map(r => r.rank), 0.001);
    results = fulltextResults.map(r => ({
      pageSlug: r.pageSlug,
      pageTitle: r.pageTitle,
      pageId: r.pageId,
      score: r.rank / maxRank,
      fulltextScore: r.rank / maxRank,
      headline: r.headline,
      matchSources: ['fulltext'] as const,
    }));
  } else {
    // Hybrid mode - merge both
    results = hybridMerge(
      vectorResults,
      fulltextResults,
      opts.scoringConfig
    );
  }

  // Apply pagination
  const paginatedResults = results.slice(opts.offset, opts.offset + opts.limit);

  // Get total count
  const totalCount = results.length;

  // Log search for analytics (async, don't wait)
  if (opts.sessionId) {
    logSearchQuery(queryString, totalCount, opts.sessionId).catch(() => {});
  }

  const searchTime = Date.now() - startTime;

  return {
    results: paginatedResults,
    query: processedQuery,
    totalCount,
    searchTime,
    pagination: {
      limit: opts.limit,
      offset: opts.offset,
      hasMore: opts.offset + opts.limit < totalCount,
    },
  };
}

/**
 * Quick search for autocomplete
 */
export async function quickSearch(
  prefix: string,
  limit: number = 5
): Promise<Array<{ slug: string; title: string }>> {
  if (prefix.length < 2) {
    return [];
  }

  // Try autocomplete first (faster)
  const autocompleteResults = await autocompleteSearch(prefix, { limit });

  if (autocompleteResults.length >= limit) {
    return autocompleteResults.map(r => ({ slug: r.slug, title: r.title }));
  }

  // Fall back to full search if not enough results
  const searchResponse = await search(prefix, {
    limit,
    mode: 'hybrid',
  });

  return searchResponse.results.map(r => ({
    slug: r.pageSlug,
    title: r.pageTitle,
  }));
}

/**
 * Get search suggestions
 */
export async function getSuggestions(
  partialQuery: string
): Promise<{
  completions: string[];
  queries: string[];
}> {
  const terms = extractTerms(partialQuery);
  const lastTerm = terms[terms.length - 1] || partialQuery;

  // Get term completions
  const completions = generateSuggestions(lastTerm, terms.slice(0, -1));

  // Get recent/popular queries
  const queries = await getSearchSuggestions(partialQuery, 5);

  return { completions, queries };
}

/**
 * Search related to a specific page
 */
export async function findRelated(
  pageSlug: string,
  limit: number = 5
): Promise<HybridSearchResult[]> {
  // Import here to avoid circular dependency
  const { findSimilarToPage } = await import('./vector-search.js');

  const similar = await findSimilarToPage(pageSlug, { limit: limit * 2 });

  // Convert to hybrid format
  return similar.slice(0, limit).map(r => ({
    pageSlug: r.pageSlug,
    pageTitle: r.pageTitle,
    pageId: r.pageId,
    score: r.similarity,
    vectorScore: r.similarity,
    matchSources: ['semantic'] as const,
  }));
}

/**
 * Search with intent-specific handling
 */
export async function intentSearch(
  queryString: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const processed = processQuery(queryString);

  // Adjust search based on intent
  let adjustedOptions = { ...options };

  switch (processed.intent) {
    case 'definition':
      // Boost fulltext for definitions (exact term matches important)
      adjustedOptions.scoringConfig = {
        ...adjustedOptions.scoringConfig,
        fulltextWeight: 0.5,
        vectorWeight: 0.5,
      };
      break;

    case 'howto':
    case 'troubleshooting':
      // Boost vector for howto/troubleshooting (semantic understanding)
      adjustedOptions.scoringConfig = {
        ...adjustedOptions.scoringConfig,
        vectorWeight: 0.7,
        fulltextWeight: 0.3,
      };
      break;

    case 'reference':
      // Boost fulltext for reference queries (exact API names)
      adjustedOptions.scoringConfig = {
        ...adjustedOptions.scoringConfig,
        fulltextWeight: 0.6,
        vectorWeight: 0.4,
      };
      break;

    case 'example':
      // Balanced for examples
      adjustedOptions.scoringConfig = {
        ...adjustedOptions.scoringConfig,
        vectorWeight: 0.55,
        fulltextWeight: 0.45,
      };
      break;

    default:
      // Use defaults for general queries
      break;
  }

  return search(queryString, adjustedOptions);
}

// Re-export types and utilities
export {
  ProcessedQuery,
  QueryIntent,
  VectorSearchResult,
  FulltextSearchResult,
  HybridSearchResult,
  HybridScoringConfig,
  DEFAULT_SCORING_CONFIG,
  processQuery,
  extractTerms,
  explainRanking,
};
