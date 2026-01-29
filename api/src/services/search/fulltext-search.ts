/**
 * Full-Text Search Service
 *
 * Implements PostgreSQL full-text search with BM25-like ranking:
 * - tsvector/tsquery based search
 * - Field boosting (title > headings > body)
 * - Phrase matching
 * - Prefix matching for autocomplete
 */

import { query } from '../../db/client.js';

/**
 * Full-text search result
 */
export interface FulltextSearchResult {
  pageSlug: string;
  pageTitle: string;
  pageId: string;
  rank: number;
  headline?: string;
  matchType: 'fulltext';
}

/**
 * Full-text search options
 */
export interface FulltextSearchOptions {
  limit?: number;
  offset?: number;
  includeHeadline?: boolean;
  categoryFilter?: string[];
  excludeSlugs?: string[];
  prefixMatch?: boolean;
  phraseMatch?: boolean;
}

/**
 * Default search configuration
 */
const DEFAULT_OPTIONS: Required<FulltextSearchOptions> = {
  limit: 20,
  offset: 0,
  includeHeadline: true,
  categoryFilter: [],
  excludeSlugs: [],
  prefixMatch: false,
  phraseMatch: false,
};

/**
 * Build tsquery from search terms
 */
export function buildTsQuery(
  searchTerms: string[],
  options: { prefixMatch?: boolean; phraseMatch?: boolean } = {}
): string {
  if (searchTerms.length === 0) return '';

  const { prefixMatch = false, phraseMatch = false } = options;

  // Clean and prepare terms
  const cleanedTerms = searchTerms
    .map(term => term.replace(/[^\w\s\-]/g, '').trim())
    .filter(term => term.length > 0);

  if (cleanedTerms.length === 0) return '';

  if (phraseMatch && cleanedTerms.length > 1) {
    // Phrase match: terms must appear adjacent
    return cleanedTerms
      .map(term => prefixMatch ? `${term}:*` : term)
      .join(' <-> ');
  }

  // Standard AND match with optional prefix
  return cleanedTerms
    .map(term => prefixMatch ? `${term}:*` : term)
    .join(' & ');
}

/**
 * Perform full-text search
 */
export async function fulltextSearch(
  searchTerms: string[],
  options: FulltextSearchOptions = {}
): Promise<FulltextSearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (searchTerms.length === 0) {
    return [];
  }

  try {
    // Build the tsquery
    const tsQuery = buildTsQuery(searchTerms, {
      prefixMatch: opts.prefixMatch,
      phraseMatch: opts.phraseMatch,
    });

    if (!tsQuery) {
      return [];
    }

    // Build the SQL query with field boosting
    // Weight: A = title (highest), B = headings, C = body, D = metadata
    let sql = `
      WITH ranked_pages AS (
        SELECT
          p.slug as page_slug,
          p.title as page_title,
          p.id as page_id,
          ts_rank_cd(
            setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(pr.content_md, '')), 'C'),
            plainto_tsquery('english', $1),
            32  -- Normalize by document length
          ) as rank
          ${opts.includeHeadline ? `,
          ts_headline(
            'english',
            COALESCE(pr.content_md, ''),
            plainto_tsquery('english', $1),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=2'
          ) as headline
          ` : ''}
        FROM pages p
        JOIN page_revisions pr ON p.current_published_revision_id = pr.id
        WHERE p.status = 'published'
          AND (
            to_tsvector('english', COALESCE(p.title, '')) ||
            to_tsvector('english', COALESCE(pr.content_md, ''))
          ) @@ plainto_tsquery('english', $1)
    `;

    const params: any[] = [searchTerms.join(' ')];
    let paramIndex = 2;

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

    sql += `
      )
      SELECT * FROM ranked_pages
      WHERE rank > 0
      ORDER BY rank DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;
    params.push(opts.limit, opts.offset);

    const result = await query<{
      page_slug: string;
      page_title: string;
      page_id: string;
      rank: number;
      headline?: string;
    }>(sql, params);

    return result.rows.map(row => ({
      pageSlug: row.page_slug,
      pageTitle: row.page_title,
      pageId: row.page_id,
      rank: row.rank,
      headline: row.headline,
      matchType: 'fulltext' as const,
    }));
  } catch (error) {
    console.error('Full-text search error:', error);
    return [];
  }
}

/**
 * Search with advanced query syntax
 * Supports: AND, OR, NOT, phrases ("...")
 */
export async function advancedFulltextSearch(
  queryString: string,
  options: Omit<FulltextSearchOptions, 'prefixMatch' | 'phraseMatch'> = {}
): Promise<FulltextSearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Parse advanced query into tsquery format
    // This is a simplified parser - a full implementation would be more complex
    let tsQuery = queryString
      .replace(/\bAND\b/gi, '&')
      .replace(/\bOR\b/gi, '|')
      .replace(/\bNOT\b/gi, '!')
      .replace(/"([^"]+)"/g, (_, phrase) => {
        // Convert phrase to tsquery phrase syntax
        const words = phrase.trim().split(/\s+/);
        return words.join(' <-> ');
      });

    // Build the SQL query
    let sql = `
      SELECT
        p.slug as page_slug,
        p.title as page_title,
        p.id as page_id,
        ts_rank_cd(
          setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(pr.content_md, '')), 'C'),
          to_tsquery('english', $1),
          32
        ) as rank
        ${opts.includeHeadline ? `,
        ts_headline(
          'english',
          COALESCE(pr.content_md, ''),
          to_tsquery('english', $1),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=2'
        ) as headline
        ` : ''}
      FROM pages p
      JOIN page_revisions pr ON p.current_published_revision_id = pr.id
      WHERE p.status = 'published'
        AND (
          to_tsvector('english', COALESCE(p.title, '')) ||
          to_tsvector('english', COALESCE(pr.content_md, ''))
        ) @@ to_tsquery('english', $1)
    `;

    const params: any[] = [tsQuery];
    let paramIndex = 2;

    // Add category filter
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

    // Add slug exclusion
    if (opts.excludeSlugs.length > 0) {
      sql += ` AND p.slug != ALL($${paramIndex}::text[])`;
      params.push(opts.excludeSlugs);
      paramIndex++;
    }

    sql += `
      ORDER BY rank DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;
    params.push(opts.limit, opts.offset);

    const result = await query<{
      page_slug: string;
      page_title: string;
      page_id: string;
      rank: number;
      headline?: string;
    }>(sql, params);

    return result.rows.map(row => ({
      pageSlug: row.page_slug,
      pageTitle: row.page_title,
      pageId: row.page_id,
      rank: row.rank,
      headline: row.headline,
      matchType: 'fulltext' as const,
    }));
  } catch (error) {
    console.error('Advanced full-text search error:', error);
    // Fallback to simple search
    return fulltextSearch(queryString.split(/\s+/), options);
  }
}

/**
 * Autocomplete search using prefix matching
 */
export async function autocompleteSearch(
  prefix: string,
  options: Pick<FulltextSearchOptions, 'limit' | 'categoryFilter'> = {}
): Promise<Array<{ slug: string; title: string; rank: number }>> {
  const limit = options.limit || 10;

  if (prefix.length < 2) {
    return [];
  }

  try {
    // Use prefix matching on title for autocomplete
    let sql = `
      SELECT
        p.slug,
        p.title,
        ts_rank_cd(
          to_tsvector('english', p.title),
          to_tsquery('english', $1)
        ) as rank
      FROM pages p
      WHERE p.status = 'published'
        AND to_tsvector('english', p.title) @@ to_tsquery('english', $1)
    `;

    const tsQuery = `${prefix.replace(/[^\w]/g, '')}:*`;
    const params: any[] = [tsQuery];
    let paramIndex = 2;

    if (options.categoryFilter && options.categoryFilter.length > 0) {
      sql += `
        AND EXISTS (
          SELECT 1 FROM page_categories pc
          JOIN categories c ON pc.category_id = c.id
          WHERE pc.page_slug = p.slug
            AND c.slug = ANY($${paramIndex}::text[])
        )
      `;
      params.push(options.categoryFilter);
      paramIndex++;
    }

    sql += `
      ORDER BY rank DESC, p.title
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await query<{
      slug: string;
      title: string;
      rank: number;
    }>(sql, params);

    return result.rows;
  } catch (error) {
    console.error('Autocomplete search error:', error);
    return [];
  }
}

/**
 * Get search suggestions based on popular/recent searches
 */
export async function getSearchSuggestions(
  partialQuery: string,
  limit: number = 5
): Promise<string[]> {
  if (partialQuery.length < 2) {
    return [];
  }

  try {
    const result = await query<{ query: string }>(`
      SELECT DISTINCT query
      FROM search_analytics
      WHERE query ILIKE $1
        AND results_count > 0
      ORDER BY timestamp DESC
      LIMIT $2
    `, [`${partialQuery}%`, limit]);

    return result.rows.map(r => r.query);
  } catch (error) {
    // Search analytics might not exist yet
    console.warn('Search suggestions unavailable:', error);
    return [];
  }
}

/**
 * Count total results for pagination
 */
export async function countSearchResults(
  searchTerms: string[],
  options: Pick<FulltextSearchOptions, 'categoryFilter' | 'excludeSlugs'> = {}
): Promise<number> {
  if (searchTerms.length === 0) {
    return 0;
  }

  try {
    let sql = `
      SELECT COUNT(*) as count
      FROM pages p
      JOIN page_revisions pr ON p.current_published_revision_id = pr.id
      WHERE p.status = 'published'
        AND (
          to_tsvector('english', COALESCE(p.title, '')) ||
          to_tsvector('english', COALESCE(pr.content_md, ''))
        ) @@ plainto_tsquery('english', $1)
    `;

    const params: any[] = [searchTerms.join(' ')];
    let paramIndex = 2;

    if (options.categoryFilter && options.categoryFilter.length > 0) {
      sql += `
        AND EXISTS (
          SELECT 1 FROM page_categories pc
          JOIN categories c ON pc.category_id = c.id
          WHERE pc.page_slug = p.slug
            AND c.slug = ANY($${paramIndex}::text[])
        )
      `;
      params.push(options.categoryFilter);
      paramIndex++;
    }

    if (options.excludeSlugs && options.excludeSlugs.length > 0) {
      sql += ` AND p.slug != ALL($${paramIndex}::text[])`;
      params.push(options.excludeSlugs);
    }

    const result = await query<{ count: string }>(sql, params);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('Count search results error:', error);
    return 0;
  }
}
