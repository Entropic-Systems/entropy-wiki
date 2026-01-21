import { query, getClient } from '../db/client.js';
import { PageEmbedding, SimilaritySearchResult } from '../types.js';
import { generateLocalEmbedding, LOCAL_EMBEDDING_DIMENSIONS } from './local-embeddings.js';

// Model configuration - using local all-MiniLM-L6-v2
const EMBEDDING_DIMENSIONS = LOCAL_EMBEDDING_DIMENSIONS;

// Maximum chars for embedding input
const MAX_CHUNK_CHARS = 30000;

/**
 * Generate an embedding vector for the given text
 * Uses local all-MiniLM-L6-v2 model (384 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate text if too long
  const truncatedText = text.length > MAX_CHUNK_CHARS
    ? text.slice(0, MAX_CHUNK_CHARS)
    : text;

  return generateLocalEmbedding(truncatedText);
}

/**
 * Store an embedding for a page revision
 * Optionally chunks content for large pages
 */
export async function storeEmbedding(
  pageId: string,
  revisionId: string,
  content: string,
  chunkIndex: number = 0
): Promise<PageEmbedding> {
  // Generate embedding
  const embedding = await generateEmbedding(content);

  // Format embedding as pgvector format: [0.1, 0.2, ...]
  const embeddingStr = `[${embedding.join(',')}]`;

  // Store in database
  const result = await query<PageEmbedding>(`
    INSERT INTO page_embeddings (page_id, revision_id, embedding, chunk_index, chunk_text)
    VALUES ($1, $2, $3::vector, $4, $5)
    ON CONFLICT (page_id, revision_id, chunk_index)
      DO UPDATE SET embedding = $3::vector, chunk_text = $5, created_at = NOW()
    RETURNING id, page_id, revision_id, chunk_index, chunk_text, created_at
  `, [pageId, revisionId, embeddingStr, chunkIndex, content]);

  return {
    ...result.rows[0],
    embedding, // Return the actual array
  };
}

/**
 * Find pages similar to the given content using vector similarity
 * Uses cosine distance for similarity scoring
 */
export async function findSimilarPages(
  content: string,
  limit: number = 10,
  threshold: number = 0.3
): Promise<SimilaritySearchResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(content);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Find similar pages using cosine distance
  // Lower distance = more similar, so we convert to similarity (1 - distance)
  const result = await query<SimilaritySearchResult>(`
    SELECT
      pe.page_id,
      p.title as page_title,
      p.slug as page_slug,
      pe.chunk_text,
      1 - (pe.embedding <=> $1::vector) as similarity
    FROM page_embeddings pe
    JOIN pages p ON pe.page_id = p.id
    WHERE p.status = 'published'
      AND 1 - (pe.embedding <=> $1::vector) >= $2
    ORDER BY pe.embedding <=> $1::vector
    LIMIT $3
  `, [embeddingStr, threshold, limit]);

  return result.rows;
}

/**
 * Find similar pages for routing decisions
 * Returns pages that might be good candidates for content integration
 */
export async function findPagesForRouting(
  content: string,
  limit: number = 5
): Promise<SimilaritySearchResult[]> {
  // Use a lower threshold for routing to get more candidates
  return findSimilarPages(content, limit, 0.2);
}

/**
 * Delete embeddings for a specific page
 */
export async function deletePageEmbeddings(pageId: string): Promise<number> {
  const result = await query(`
    DELETE FROM page_embeddings WHERE page_id = $1
  `, [pageId]);

  return result.rowCount || 0;
}

/**
 * Delete embeddings for a specific revision
 */
export async function deleteRevisionEmbeddings(revisionId: string): Promise<number> {
  const result = await query(`
    DELETE FROM page_embeddings WHERE revision_id = $1
  `, [revisionId]);

  return result.rowCount || 0;
}

/**
 * Backfill embeddings for all existing published pages
 * Useful for initial setup or after clearing embeddings
 */
export async function backfillEmbeddings(): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ pageId: string; error: string }>;
}> {
  const stats = {
    processed: 0,
    failed: 0,
    errors: [] as Array<{ pageId: string; error: string }>,
  };

  // Get all published pages with content that don't have embeddings
  const pagesResult = await query<{
    page_id: string;
    revision_id: string;
    content_md: string;
  }>(`
    SELECT
      p.id as page_id,
      p.current_published_revision_id as revision_id,
      pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.status = 'published'
      AND p.current_published_revision_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM page_embeddings pe
        WHERE pe.page_id = p.id
          AND pe.revision_id = p.current_published_revision_id
      )
  `);

  console.log(`Backfilling embeddings for ${pagesResult.rows.length} pages`);

  for (const page of pagesResult.rows) {
    try {
      await storeEmbedding(page.page_id, page.revision_id, page.content_md);
      stats.processed++;
      console.log(`Generated embedding for page ${page.page_id}`);
    } catch (error: any) {
      stats.failed++;
      stats.errors.push({
        pageId: page.page_id,
        error: error.message || 'Unknown error',
      });
      console.error(`Failed to generate embedding for page ${page.page_id}:`, error.message);
    }
  }

  return stats;
}

/**
 * Update embedding for a specific page (when content changes)
 */
export async function updatePageEmbedding(pageId: string): Promise<PageEmbedding | null> {
  // Get the current published revision content
  const pageResult = await query<{
    revision_id: string;
    content_md: string;
  }>(`
    SELECT
      p.current_published_revision_id as revision_id,
      pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.id = $1
      AND p.status = 'published'
      AND p.current_published_revision_id IS NOT NULL
  `, [pageId]);

  if (pageResult.rows.length === 0) {
    return null;
  }

  const { revision_id, content_md } = pageResult.rows[0];

  // Delete old embeddings for this page
  await deletePageEmbeddings(pageId);

  // Generate and store new embedding
  return storeEmbedding(pageId, revision_id, content_md);
}

/**
 * Check if a page has an up-to-date embedding
 */
export async function hasCurrentEmbedding(pageId: string): Promise<boolean> {
  const result = await query<{ has_embedding: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM page_embeddings pe
      JOIN pages p ON pe.page_id = p.id
      WHERE p.id = $1
        AND pe.revision_id = p.current_published_revision_id
    ) as has_embedding
  `, [pageId]);

  return result.rows[0].has_embedding;
}

export { EMBEDDING_DIMENSIONS };
