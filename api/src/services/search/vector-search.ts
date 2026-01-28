/**
 * Vector Search Service
 *
 * Implements semantic search using pgvector:
 * - Embedding generation
 * - Cosine similarity search
 * - ANN (Approximate Nearest Neighbor) queries
 */

import { query } from '../../db/client.js';
import { generateEmbedding } from '../embeddings.js';

/**
 * Vector search result
 */
export interface VectorSearchResult {
  pageSlug: string;
  pageTitle: string;
  pageId: string;
  similarity: number;
  chunkText?: string;
  chunkIndex: number;
  matchType: 'semantic';
}

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  includeChunkText?: boolean;
  categoryFilter?: string[];
  excludeSlugs?: string[];
}

/**
 * Default search configuration
 */
const DEFAULT_OPTIONS: Required<VectorSearchOptions> = {
  limit: 20,
  threshold: 0.3,
  includeChunkText: false,
  categoryFilter: [],
  excludeSlugs: [],
};

/**
 * Perform vector similarity search
 */
export async function vectorSearch(
  queryText: string,
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(queryText);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build query with optional filters
    let sql = `
      SELECT
        p.slug as page_slug,
        p.title as page_title,
        p.id as page_id,
        pe.chunk_index,
        1 - (pe.embedding <=> $1::vector) as similarity
        ${opts.includeChunkText ? ', pe.chunk_text' : ''}
      FROM page_embeddings pe
      JOIN pages p ON pe.page_id = p.id
      WHERE p.status = 'published'
        AND 1 - (pe.embedding <=> $1::vector) >= $2
    `;

    const params: any[] = [embeddingStr, opts.threshold];
    let paramIndex = 3;

    // Add category filter if specified
    if (opts.categoryFilter.length > 0) {
      sql += `
        AND EXISTS (
          SELECT 1 FROM page_categories pc
          JOIN categories c ON pc.category_id = c.id
          WHERE pc.page_slug = p.slug
            AND c.slug = ANY($${paramIndex}::text[])
        )
      `;
      params.push(opts.categoryFilter);
      paramIndex++;
    }

    // Add slug exclusion filter
    if (opts.excludeSlugs.length > 0) {
      sql += ` AND p.slug != ALL($${paramIndex}::text[])`;
      params.push(opts.excludeSlugs);
      paramIndex++;
    }

    // Order by similarity and limit
    sql += `
      ORDER BY pe.embedding <=> $1::vector
      LIMIT $${paramIndex}
    `;
    params.push(opts.limit);

    const result = await query<{
      page_slug: string;
      page_title: string;
      page_id: string;
      chunk_index: number;
      similarity: number;
      chunk_text?: string;
    }>(sql, params);

    return result.rows.map(row => ({
      pageSlug: row.page_slug,
      pageTitle: row.page_title,
      pageId: row.page_id,
      similarity: row.similarity,
      chunkText: row.chunk_text,
      chunkIndex: row.chunk_index,
      matchType: 'semantic' as const,
    }));
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Search with query expansion
 * Searches for the original query plus expanded terms
 */
export async function expandedVectorSearch(
  queryText: string,
  expandedTerms: string[],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Search with original query first
  const mainResults = await vectorSearch(queryText, opts);

  // If we have enough good results, return them
  if (mainResults.length >= opts.limit && mainResults[0]?.similarity > 0.7) {
    return mainResults;
  }

  // Search with expanded terms to boost recall
  const expandedQuery = [queryText, ...expandedTerms.slice(0, 5)].join(' ');
  const expandedResults = await vectorSearch(expandedQuery, {
    ...opts,
    limit: opts.limit * 2, // Get more candidates
    threshold: opts.threshold * 0.8, // Lower threshold for expanded
  });

  // Merge results, preferring main results
  const seen = new Set(mainResults.map(r => r.pageSlug));
  const merged = [...mainResults];

  for (const result of expandedResults) {
    if (!seen.has(result.pageSlug)) {
      // Discount expanded results slightly
      merged.push({
        ...result,
        similarity: result.similarity * 0.9,
      });
      seen.add(result.pageSlug);
    }
  }

  // Sort by similarity and limit
  return merged
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, opts.limit);
}

/**
 * Find most similar page to a given page
 */
export async function findSimilarToPage(
  pageSlug: string,
  options: Omit<VectorSearchOptions, 'excludeSlugs'> = {}
): Promise<VectorSearchResult[]> {
  // Get the page's content
  const pageResult = await query<{
    content_md: string;
  }>(`
    SELECT pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.slug = $1
  `, [pageSlug]);

  if (pageResult.rows.length === 0) {
    return [];
  }

  // Search using the page's content, excluding itself
  return vectorSearch(pageResult.rows[0].content_md, {
    ...options,
    excludeSlugs: [pageSlug],
  });
}

/**
 * Get embedding for a query (useful for caching/analysis)
 */
export async function getQueryEmbedding(queryText: string): Promise<number[]> {
  return generateEmbedding(queryText);
}

/**
 * Calculate similarity between two texts
 */
export async function calculateSimilarity(
  text1: string,
  text2: string
): Promise<number> {
  const [emb1, emb2] = await Promise.all([
    generateEmbedding(text1),
    generateEmbedding(text2),
  ]);

  // Cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < emb1.length; i++) {
    dotProduct += emb1[i] * emb2[i];
    norm1 += emb1[i] * emb1[i];
    norm2 += emb2[i] * emb2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Batch vector search for multiple queries
 */
export async function batchVectorSearch(
  queries: string[],
  options: VectorSearchOptions = {}
): Promise<Map<string, VectorSearchResult[]>> {
  const results = new Map<string, VectorSearchResult[]>();

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(q => vectorSearch(q, options))
    );

    for (let j = 0; j < batch.length; j++) {
      results.set(batch[j], batchResults[j]);
    }
  }

  return results;
}

/**
 * Search analytics - store query embedding for later analysis
 */
export async function logSearchQuery(
  queryText: string,
  resultsCount: number,
  sessionId?: string
): Promise<void> {
  try {
    const embedding = await generateEmbedding(queryText);
    const embeddingStr = `[${embedding.join(',')}]`;

    await query(`
      INSERT INTO search_analytics (
        session_id, query, query_embedding, results_count, timestamp
      ) VALUES ($1, $2, $3::vector, $4, NOW())
    `, [sessionId || null, queryText, embeddingStr, resultsCount]);
  } catch (error) {
    // Don't fail search if analytics fails
    console.warn('Failed to log search query:', error);
  }
}
