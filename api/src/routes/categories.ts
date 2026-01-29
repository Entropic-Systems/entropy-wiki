/**
 * Categories API Routes
 *
 * Provides category management endpoints:
 * - GET /categories - Get category tree
 * - GET /categories/:id - Get single category
 * - POST /categories - Create category (auth required)
 * - PUT /categories/:id - Update category (auth required)
 * - DELETE /categories/:id - Delete category (auth required)
 * - GET /categories/:id/pages - Get pages in category
 * - POST /pages/:slug/categorize - Auto-categorize a page (auth required)
 * - GET /categories/stats - Get category statistics
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  getCategoryTree,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryPages,
  getPageCategories,
  assignPageToCategory,
  removePageFromCategory,
  getCategoryStats,
  mergeCategories,
} from '../services/categorization/index.js';
import {
  classifyContent,
  autoCategorize,
  suggestNewCategories,
} from '../services/categorization/topic-classifier.js';
import {
  analyzePlacement,
  analyzeStructureHealth,
} from '../services/categorization/placement-advisor.js';
import { query } from '../db/client.js';
import { getAdminPasswordHash, comparePassword } from '../utils/auth.js';

const router = Router();

/**
 * Auth middleware for write operations
 * Uses bcrypt for secure password comparison (aligned with admin.ts)
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

/**
 * GET /categories
 *
 * Get the full category tree
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tree = await getCategoryTree();
    res.json({ categories: tree });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to fetch categories',
    });
  }
});

/**
 * GET /categories/stats
 *
 * Get category statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getCategoryStats();
    res.json(stats);
  } catch (err) {
    console.error('Error fetching category stats:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to fetch category statistics',
    });
  }
});

/**
 * GET /categories/structure-health
 *
 * Analyze wiki structure health
 */
router.get('/structure-health', async (_req: Request, res: Response) => {
  try {
    const health = await analyzeStructureHealth();
    res.json(health);
  } catch (err) {
    console.error('Error analyzing structure health:', err);
    res.status(500).json({
      error: 'analysis_error',
      message: 'Failed to analyze structure health',
    });
  }
});

/**
 * GET /categories/suggestions
 *
 * Get suggested new categories based on uncategorized content
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 5;
    const suggestions = await suggestNewCategories(threshold);
    res.json({ suggestions });
  } catch (err) {
    console.error('Error getting category suggestions:', err);
    res.status(500).json({
      error: 'analysis_error',
      message: 'Failed to generate category suggestions',
    });
  }
});

/**
 * GET /categories/:idOrSlug
 *
 * Get a single category by ID or slug
 */
router.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    // Try by ID first, then by slug
    let category = await getCategoryById(idOrSlug);
    if (!category) {
      category = await getCategoryBySlug(idOrSlug);
    }

    if (!category) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Category not found',
      });
    }

    res.json({ category });
  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to fetch category',
    });
  }
});

/**
 * GET /categories/:id/pages
 *
 * Get pages in a category
 */
router.get('/:id/pages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const includeChildren = req.query.includeChildren === 'true';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const pages = await getCategoryPages(id, { includeChildren, limit, offset });
    res.json({ pages });
  } catch (err) {
    console.error('Error fetching category pages:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to fetch category pages',
    });
  }
});

/**
 * POST /categories
 *
 * Create a new category (requires authentication)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, slug, parentId, description, icon, sortOrder } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Name and slug are required',
      });
    }

    // Check for duplicate slug
    const existing = await getCategoryBySlug(slug);
    if (existing) {
      return res.status(409).json({
        error: 'duplicate_error',
        message: 'A category with this slug already exists',
      });
    }

    const category = await createCategory({
      name,
      slug,
      parentId,
      description,
      icon,
      sortOrder,
    });

    res.status(201).json({ category });
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to create category',
    });
  }
});

/**
 * PUT /categories/:id
 *
 * Update a category (requires authentication)
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, parentId, description, icon, sortOrder } = req.body;

    // Check if slug is being changed to an existing one
    if (slug) {
      const existing = await getCategoryBySlug(slug);
      if (existing && existing.id !== id) {
        return res.status(409).json({
          error: 'duplicate_error',
          message: 'A category with this slug already exists',
        });
      }
    }

    const category = await updateCategory(id, {
      name,
      slug,
      parentId,
      description,
      icon,
      sortOrder,
    });

    if (!category) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Category not found',
      });
    }

    res.json({ category });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to update category',
    });
  }
});

/**
 * DELETE /categories/:id
 *
 * Delete a category (requires authentication)
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await deleteCategory(id);

    if (!deleted) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Category not found',
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to delete category',
    });
  }
});

/**
 * POST /categories/:sourceId/merge/:targetId
 *
 * Merge source category into target (requires authentication)
 */
router.post('/:sourceId/merge/:targetId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sourceId, targetId } = req.params;

    // Verify both categories exist
    const [source, target] = await Promise.all([
      getCategoryById(sourceId),
      getCategoryById(targetId),
    ]);

    if (!source) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Source category not found',
      });
    }

    if (!target) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Target category not found',
      });
    }

    await mergeCategories(sourceId, targetId);

    res.json({
      success: true,
      message: `Merged "${source.name}" into "${target.name}"`,
    });
  } catch (err) {
    console.error('Error merging categories:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to merge categories',
    });
  }
});

/**
 * GET /pages/:slug/categories
 *
 * Get categories for a page
 */
router.get('/pages/:slug/categories', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const categories = await getPageCategories(slug);
    res.json({ categories });
  } catch (err) {
    console.error('Error fetching page categories:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to fetch page categories',
    });
  }
});

/**
 * POST /pages/:slug/categories/:categoryId
 *
 * Assign a page to a category (requires authentication)
 */
router.post('/pages/:slug/categories/:categoryId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { slug, categoryId } = req.params;
    const { confidence = 1.0, isPrimary = false, assignedBy = 'user' } = req.body;

    await assignPageToCategory(slug, categoryId, {
      confidence,
      isPrimary,
      assignedBy,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning page to category:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to assign page to category',
    });
  }
});

/**
 * DELETE /pages/:slug/categories/:categoryId
 *
 * Remove a page from a category (requires authentication)
 */
router.delete('/pages/:slug/categories/:categoryId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { slug, categoryId } = req.params;
    await removePageFromCategory(slug, categoryId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing page from category:', err);
    res.status(500).json({
      error: 'database_error',
      message: 'Failed to remove page from category',
    });
  }
});

/**
 * POST /pages/:slug/auto-categorize
 *
 * Auto-categorize a page using AI (requires authentication)
 */
router.post('/pages/:slug/auto-categorize', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { apply = false } = req.body;

    // Get page content
    const pageResult = await query<{
      title: string;
      content_md: string;
    }>(`
      SELECT p.title, pr.content_md
      FROM pages p
      JOIN page_revisions pr ON p.current_published_revision_id = pr.id
      WHERE p.slug = $1
    `, [slug]);

    if (pageResult.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Page not found',
      });
    }

    const { title, content_md } = pageResult.rows[0];

    const result = await autoCategorize(slug, content_md, title, { apply });

    res.json({
      classification: result,
      applied: result.applied,
    });
  } catch (err) {
    console.error('Error auto-categorizing page:', err);
    res.status(500).json({
      error: 'classification_error',
      message: 'Failed to auto-categorize page',
    });
  }
});

/**
 * POST /content/classify
 *
 * Classify content without saving (preview, requires authentication)
 */
router.post('/content/classify', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { content, title } = req.body;

    if (!content || !title) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Content and title are required',
      });
    }

    const classification = await classifyContent(content, title);
    const placement = await analyzePlacement(content, title);

    res.json({
      classification,
      placement,
    });
  } catch (err) {
    console.error('Error classifying content:', err);
    res.status(500).json({
      error: 'classification_error',
      message: 'Failed to classify content',
    });
  }
});

export default router;
