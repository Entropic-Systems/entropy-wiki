/**
 * Search API Routes
 *
 * Provides search endpoints for the wiki:
 * - GET /search - Main hybrid search
 * - GET /search/quick - Autocomplete/quick search
 * - GET /search/suggestions - Search suggestions
 * - GET /search/related/:slug - Find related content
 * - GET /search/stats - Search analytics (admin only)
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  search,
  quickSearch,
  getSuggestions,
  findRelated,
  intentSearch,
  SearchOptions,
} from '../services/search/index.js';
import { getAdminPasswordHash, comparePassword } from '../utils/auth.js';

/**
 * Auth middleware for admin-only endpoints
 */
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const password = req.headers['x-admin-password'] as string;

  if (!password) {
    return res.status(401).json({ error: 'unauthorized', message: 'Admin password required' });
  }

  try {
    const adminPasswordHash = await getAdminPasswordHash();
    const isValid = await comparePassword(password, adminPasswordHash);

    if (!isValid) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid admin password' });
    }

    next();
  } catch (err) {
    console.error('Auth configuration error:', err);
    return res.status(500).json({ error: 'config_error', message: 'Server not configured for admin access' });
  }
}

const router = Router();

/**
 * GET /search
 *
 * Main search endpoint with hybrid vector + fulltext search
 *
 * Query params:
 * - q: Search query (required)
 * - limit: Max results (default: 20)
 * - offset: Pagination offset (default: 0)
 * - category: Filter by category (can be repeated)
 * - mode: Search mode - 'hybrid' | 'vector' | 'fulltext' (default: hybrid)
 * - intent: Use intent-aware search (default: false)
 */
// Maximum query length to prevent DoS via huge query strings
const MAX_QUERY_LENGTH = 1000;

router.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'invalid_query',
        message: 'Search query (q) is required',
      });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: 'invalid_query',
        message: `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
      });
    }

    // Parse options from query params
    const options: SearchOptions = {
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
      categoryFilter: Array.isArray(req.query.category)
        ? (req.query.category as string[])
        : req.query.category
          ? [req.query.category as string]
          : [],
      mode: (req.query.mode as 'hybrid' | 'vector' | 'fulltext') || 'hybrid',
      sessionId: req.query.sessionId as string || undefined,
    };

    // Validate options
    if (options.limit! < 1 || options.limit! > 100) {
      return res.status(400).json({
        error: 'invalid_limit',
        message: 'Limit must be between 1 and 100',
      });
    }

    if (options.offset! < 0) {
      return res.status(400).json({
        error: 'invalid_offset',
        message: 'Offset must be non-negative',
      });
    }

    // Use intent-aware search if requested
    const useIntent = req.query.intent === 'true' || req.query.intent === '1';
    const response = useIntent
      ? await intentSearch(query.trim(), options)
      : await search(query.trim(), options);

    res.json({
      results: response.results,
      query: {
        original: response.query.original,
        normalized: response.query.normalized,
        intent: response.query.intent,
        entities: response.query.entities,
      },
      pagination: response.pagination,
      meta: {
        totalCount: response.totalCount,
        searchTime: response.searchTime,
        mode: options.mode,
      },
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      error: 'search_error',
      message: 'Failed to perform search',
    });
  }
});

/**
 * GET /search/quick
 *
 * Quick search for autocomplete functionality
 *
 * Query params:
 * - q: Search prefix (required, min 2 chars)
 * - limit: Max results (default: 5)
 */
router.get('/quick', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'invalid_query',
        message: 'Search query (q) is required',
      });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: 'invalid_query',
        message: `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
      });
    }

    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);
    const results = await quickSearch(query.trim(), limit);

    res.json({ results });
  } catch (err) {
    console.error('Quick search error:', err);
    res.status(500).json({
      error: 'search_error',
      message: 'Failed to perform quick search',
    });
  }
});

/**
 * GET /search/suggestions
 *
 * Get search suggestions based on partial query
 *
 * Query params:
 * - q: Partial query (required)
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'invalid_query',
        message: 'Query (q) is required',
      });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: 'invalid_query',
        message: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
      });
    }

    const suggestions = await getSuggestions(query.trim());

    res.json(suggestions);
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({
      error: 'suggestion_error',
      message: 'Failed to get suggestions',
    });
  }
});

/**
 * GET /search/related/:slug
 *
 * Find content related to a specific page
 *
 * Params:
 * - slug: Page slug to find related content for
 *
 * Query params:
 * - limit: Max results (default: 5)
 */
router.get('/related/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        error: 'invalid_slug',
        message: 'Page slug is required',
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const results = await findRelated(slug, limit);

    res.json({ results });
  } catch (err) {
    console.error('Related search error:', err);
    res.status(500).json({
      error: 'search_error',
      message: 'Failed to find related content',
    });
  }
});

/**
 * GET /search/stats
 *
 * Get search statistics and analytics
 * (Admin-only endpoint - requires authentication)
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Import query here to avoid issues
    const { query: dbQuery } = await import('../db/client.js');

    // Get basic stats
    const [searchCount, topQueries, intentBreakdown] = await Promise.all([
      dbQuery<{ count: string }>(`
        SELECT COUNT(*) as count FROM search_analytics
        WHERE timestamp > NOW() - INTERVAL '24 hours'
      `),
      dbQuery<{ query: string; count: string }>(`
        SELECT query, COUNT(*) as count
        FROM search_analytics
        WHERE timestamp > NOW() - INTERVAL '7 days'
          AND results_count > 0
        GROUP BY query
        ORDER BY count DESC
        LIMIT 10
      `),
      dbQuery<{ intent: string; count: string }>(`
        SELECT intent, COUNT(*) as count
        FROM search_analytics
        WHERE timestamp > NOW() - INTERVAL '7 days'
          AND intent IS NOT NULL
        GROUP BY intent
        ORDER BY count DESC
      `),
    ]);

    res.json({
      last24Hours: parseInt(searchCount.rows[0]?.count || '0'),
      topQueries: topQueries.rows.map(r => ({
        query: r.query,
        count: parseInt(r.count),
      })),
      intentBreakdown: intentBreakdown.rows.map(r => ({
        intent: r.intent,
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    console.error('Search stats error:', err);
    res.status(500).json({
      error: 'stats_error',
      message: 'Failed to get search statistics',
    });
  }
});

export default router;
