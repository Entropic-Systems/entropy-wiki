import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { timingSafeEqual } from 'crypto';
import { query, getClient } from '../db/client.js';
import { Page, PageWithContent, PageTreeNode, CreatePageRequest, UpdatePageRequest } from '../types.js';
import { getAdminPasswordHash, comparePassword } from '../utils/auth.js';
import { validateSlug, validateTitle, validateContent, validateUUID, sanitizeString } from '../utils/validation.js';

const router = Router();

// Auth middleware - uses bcrypt for secure password comparison
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

// Apply auth to all admin routes
router.use(authMiddleware);

// GET /admin/pages - List all pages (including drafts)
router.get('/pages', async (_req: Request, res: Response) => {
  try {
    const result = await query<Page>(`
      SELECT id, slug, title, status,
             current_published_revision_id, current_draft_revision_id,
             created_at, updated_at,
             parent_id, sort_order
      FROM pages
      ORDER BY updated_at DESC
    `);

    res.json({ pages: result.rows });
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch pages' });
  }
});

// GET /admin/pages/tree - Get hierarchical tree of all pages
router.get('/pages/tree', async (_req: Request, res: Response) => {
  try {
    // Fetch all pages with hierarchy fields using recursive CTE for depth
    const result = await query<Page & { depth: number }>(`
      WITH RECURSIVE page_tree AS (
        -- Root pages (no parent)
        SELECT p.*, 0 as depth
        FROM pages p
        WHERE p.parent_id IS NULL

        UNION ALL

        -- Child pages
        SELECT p.*, pt.depth + 1
        FROM pages p
        INNER JOIN page_tree pt ON p.parent_id = pt.id
      )
      SELECT id, slug, title, status,
             current_published_revision_id, current_draft_revision_id,
             created_at, updated_at,
             parent_id, sort_order, depth
      FROM page_tree
      ORDER BY depth, sort_order, title
    `);

    // Build tree structure
    const pageMap = new Map<string, PageTreeNode>();
    const roots: PageTreeNode[] = [];

    // First pass: create all nodes
    for (const page of result.rows) {
      const node: PageTreeNode = {
        ...page,
        children: [],
        inherited_visibility: false  // No longer used, kept for API compat
      };
      pageMap.set(page.id, node);
    }

    // Second pass: build tree relationships
    for (const page of result.rows) {
      const node = pageMap.get(page.id)!;
      if (page.parent_id) {
        const parent = pageMap.get(page.parent_id);
        if (parent) {
          parent.children.push(node);
        } else {
          // Parent not found (orphan), treat as root
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    // Sort children by sort_order then title
    const sortChildren = (nodes: PageTreeNode[]) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
      for (const node of nodes) {
        sortChildren(node.children);
      }
    };
    sortChildren(roots);

    res.json({ tree: roots });
  } catch (err) {
    console.error('Error fetching page tree:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch page tree' });
  }
});

// GET /admin/pages/:id/descendants - Get all descendants of a page (for cascade preview)
router.get('/pages/:id/descendants', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Get all descendant pages using recursive CTE (excludes the root page itself)
    const result = await query<{ id: string; title: string; slug: string; status: string }>(`
      WITH RECURSIVE descendants AS (
        -- Direct children of the target page
        SELECT id, title, slug, status, 1 as depth
        FROM pages WHERE parent_id = $1

        UNION ALL

        -- Grandchildren and deeper
        SELECT p.id, p.title, p.slug, p.status, d.depth + 1
        FROM pages p
        INNER JOIN descendants d ON p.parent_id = d.id
      )
      SELECT id, title, slug, status, depth
      FROM descendants
      ORDER BY depth, title
    `, [id]);

    res.json({
      descendants: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching descendants:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch descendants' });
  }
});

// GET /admin/pages/:id - Get a single page with content (draft if exists, else published)
router.get('/pages/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // First get the page
    const pageResult = await query<Page>(`
      SELECT id, slug, title, status,
             current_published_revision_id, current_draft_revision_id,
             created_at, updated_at,
             parent_id, sort_order
      FROM pages
      WHERE id = $1
    `, [id]);

    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    const page = pageResult.rows[0];

    // Get content from draft revision if exists, otherwise published
    const revisionId = page.current_draft_revision_id || page.current_published_revision_id;

    let content_md = '';
    if (revisionId) {
      const revisionResult = await query<{ content_md: string }>(`
        SELECT content_md FROM page_revisions WHERE id = $1
      `, [revisionId]);

      if (revisionResult.rows.length > 0) {
        content_md = revisionResult.rows[0].content_md;
      }
    }

    res.json({ page: { ...page, content_md } as PageWithContent });
  } catch (err) {
    console.error('Error fetching page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch page' });
  }
});

// POST /admin/pages - Create a new page
router.post('/pages', async (req: Request, res: Response) => {
  // Validate request body structure
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body'
    });
  }

  const body = req.body as CreatePageRequest;

  if (!body.slug || !body.title || !body.content_md) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'slug, title, and content_md are required'
    });
  }

  // Validate slug
  if (!validateSlug(body.slug)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid slug format. Must be URL-safe and not contain path traversal attempts'
    });
  }

  // Validate title
  if (!validateTitle(body.title)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid title. Must be between 1 and 500 characters'
    });
  }

  // Validate content
  if (!validateContent(body.content_md)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid content. Maximum size is 10MB'
    });
  }

  // Sanitize inputs
  const sanitizedTitle = sanitizeString(body.title);

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const pageId = uuidv4();
    const revisionId = uuidv4();
    const status = body.status || 'draft';

    // Create the page first (without revision references due to FK constraint)
    await client.query(`
      INSERT INTO pages (id, slug, title, status)
      VALUES ($1, $2, $3, $4)
    `, [pageId, body.slug, sanitizedTitle, status]);

    // Create the revision (now page exists for FK)
    await client.query(`
      INSERT INTO page_revisions (id, page_id, content_md, author_type)
      VALUES ($1, $2, $3, 'human')
    `, [revisionId, pageId, body.content_md]);

    // Update page with revision references
    const publishedRevId = status === 'published' ? revisionId : null;
    const draftRevId = status === 'draft' ? revisionId : null;

    await client.query(`
      UPDATE pages
      SET current_published_revision_id = $1, current_draft_revision_id = $2
      WHERE id = $3
    `, [publishedRevId, draftRevId, pageId]);

    await client.query('COMMIT');

    res.status(201).json({
      page: {
        id: pageId,
        slug: body.slug,
        title: sanitizedTitle,
        status,
        current_published_revision_id: publishedRevId,
        current_draft_revision_id: draftRevId,
        content_md: body.content_md
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');

    const pgError = err as { code?: string };
    if (pgError.code === '23505') { // unique violation
      return res.status(409).json({ error: 'conflict', message: 'A page with this slug already exists' });
    }

    console.error('Error creating page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to create page' });
  } finally {
    client.release();
  }
});

// PATCH /admin/pages/:id - Update a page (creates new draft revision)
router.patch('/pages/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as UpdatePageRequest;

  // Validate page ID
  if (!validateUUID(id)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid page ID format'
    });
  }

  // Validate optional fields if provided
  if (body.title !== undefined && !validateTitle(body.title)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid title. Must be between 1 and 500 characters'
    });
  }

  if (body.content_md !== undefined && !validateContent(body.content_md)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid content. Maximum size is 10MB'
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check page exists
    const existingResult = await client.query(`
      SELECT id, slug, title, status, current_draft_revision_id, current_published_revision_id
      FROM pages WHERE id = $1
    `, [id]);

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    const existing = existingResult.rows[0];

    // If content changed, create new draft revision
    let newDraftRevisionId = existing.current_draft_revision_id;
    if (body.content_md !== undefined) {
      newDraftRevisionId = uuidv4();
      await client.query(`
        INSERT INTO page_revisions (id, page_id, content_md, author_type)
        VALUES ($1, $2, $3, 'human')
      `, [newDraftRevisionId, id, body.content_md]);
    }

    // Update page metadata
    const title = body.title ? sanitizeString(body.title) : existing.title;
    const status = body.status ?? existing.status;

    await client.query(`
      UPDATE pages
      SET title = $1, status = $2, current_draft_revision_id = $3
      WHERE id = $4
    `, [title, status, newDraftRevisionId, id]);

    await client.query('COMMIT');

    res.json({
      message: 'Page updated',
      page: {
        id,
        slug: existing.slug,
        title,
        status,
        current_draft_revision_id: newDraftRevisionId
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to update page' });
  } finally {
    client.release();
  }
});

// POST /admin/pages/:id/move - Move page to new parent with sort_order
router.post('/pages/:id/move', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { parent_id, sort_order } = req.body as { parent_id: string | null; sort_order?: number };

  // Validate page ID
  if (!validateUUID(id)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid page ID format'
    });
  }

  // Validate parent_id if provided
  if (parent_id !== null && !validateUUID(parent_id)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid parent ID format'
    });
  }

  const client = await getClient();

  try {
    // Use SERIALIZABLE isolation to prevent hierarchy race conditions (TOCTOU)
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Lock the page being moved with FOR UPDATE to serialize concurrent moves
    const pageResult = await client.query(`
      SELECT id FROM pages WHERE id = $1 FOR UPDATE
    `, [id]);

    if (pageResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    // If parent_id specified, validate it exists and check for circular reference
    if (parent_id) {
      // Lock parent page to prevent concurrent hierarchy modifications
      const parentResult = await client.query(`
        SELECT id FROM pages WHERE id = $1 FOR UPDATE
      `, [parent_id]);

      if (parentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'invalid_parent', message: 'Parent page not found' });
      }

      // Cannot set parent to self
      if (parent_id === id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'circular_reference', message: 'Cannot set page as its own parent' });
      }

      // Check for circular reference (parent cannot be a descendant of this page)
      // The SERIALIZABLE transaction ensures consistency during this check
      const circularCheck = await client.query(`
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_id FROM pages WHERE id = $1
          UNION ALL
          SELECT p.id, p.parent_id FROM pages p
          INNER JOIN ancestors a ON p.id = a.parent_id
        )
        SELECT 1 FROM ancestors WHERE id = $2
      `, [parent_id, id]);

      if (circularCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'circular_reference',
          message: 'Cannot move page under its own descendant'
        });
      }
    }

    // Calculate sort_order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined) {
      const maxSortResult = await client.query(`
        SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort
        FROM pages WHERE parent_id IS NOT DISTINCT FROM $1
      `, [parent_id]);
      finalSortOrder = maxSortResult.rows[0].next_sort;
    }

    // Update the page
    await client.query(`
      UPDATE pages SET parent_id = $1, sort_order = $2 WHERE id = $3
    `, [parent_id, finalSortOrder, id]);

    await client.query('COMMIT');

    res.json({
      message: 'Page moved successfully',
      parent_id,
      sort_order: finalSortOrder
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error moving page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to move page' });
  } finally {
    client.release();
  }
});

// POST /admin/pages/:id/publish - Publish a page (promote draft to published)
router.post('/pages/:id/publish', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Get current draft revision
    const pageResult = await query<Page>(`
      SELECT current_draft_revision_id, current_published_revision_id
      FROM pages WHERE id = $1
    `, [id]);

    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    const page = pageResult.rows[0];
    const revisionToPublish = page.current_draft_revision_id || page.current_published_revision_id;

    if (!revisionToPublish) {
      return res.status(400).json({ error: 'no_content', message: 'Page has no content to publish' });
    }

    await query(`
      UPDATE pages
      SET status = 'published',
          current_published_revision_id = $1,
          current_draft_revision_id = NULL
      WHERE id = $2
    `, [revisionToPublish, id]);

    res.json({ message: 'Page published successfully' });
  } catch (err) {
    console.error('Error publishing page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to publish page' });
  }
});

// POST /admin/pages/:id/unpublish - Unpublish a page and all descendants (cascade)
router.post('/pages/:id/unpublish', async (req: Request, res: Response) => {
  const { id } = req.params;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get all descendant pages including the root page using recursive CTE
    const descendantsResult = await client.query(`
      WITH RECURSIVE descendants AS (
        -- Root page
        SELECT id, title FROM pages WHERE id = $1

        UNION ALL

        -- Child pages recursively
        SELECT p.id, p.title FROM pages p
        INNER JOIN descendants d ON p.parent_id = d.id
      )
      SELECT id, title FROM descendants
    `, [id]);

    if (descendantsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    // Unpublish all descendants
    const pageIds = descendantsResult.rows.map(r => r.id);
    const affectedPages = descendantsResult.rows.map(r => ({ id: r.id, title: r.title }));

    const updateResult = await client.query(`
      UPDATE pages
      SET status = 'draft',
          current_draft_revision_id = COALESCE(current_draft_revision_id, current_published_revision_id)
      WHERE id = ANY($1)
    `, [pageIds]);

    await client.query('COMMIT');

    res.json({
      message: `Page unpublished: ${updateResult.rowCount} page(s) moved to draft`,
      unpublished_count: updateResult.rowCount,
      affected_pages: affectedPages
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error unpublishing page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to unpublish page' });
  } finally {
    client.release();
  }
});

// POST /admin/pages/:id/publish-section - Publish a page and all its descendants
router.post('/pages/:id/publish-section', async (req: Request, res: Response) => {
  const { id } = req.params;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get all descendant pages including the root page using recursive CTE
    const descendantsResult = await client.query(`
      WITH RECURSIVE descendants AS (
        -- Root page
        SELECT id, current_draft_revision_id, current_published_revision_id
        FROM pages WHERE id = $1

        UNION ALL

        -- Child pages recursively
        SELECT p.id, p.current_draft_revision_id, p.current_published_revision_id
        FROM pages p
        INNER JOIN descendants d ON p.parent_id = d.id
      )
      SELECT id, current_draft_revision_id, current_published_revision_id
      FROM descendants
    `, [id]);

    if (descendantsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    // Publish each page that has content
    let publishedCount = 0;
    let skippedCount = 0;

    for (const page of descendantsResult.rows) {
      const revisionToPublish = page.current_draft_revision_id || page.current_published_revision_id;

      if (!revisionToPublish) {
        skippedCount++;
        continue;
      }

      await client.query(`
        UPDATE pages
        SET status = 'published',
            current_published_revision_id = $1,
            current_draft_revision_id = NULL
        WHERE id = $2
      `, [revisionToPublish, page.id]);

      publishedCount++;
    }

    await client.query('COMMIT');

    res.json({
      message: `Section published: ${publishedCount} pages published, ${skippedCount} skipped (no content)`,
      published_count: publishedCount,
      skipped_count: skippedCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error publishing section:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to publish section' });
  } finally {
    client.release();
  }
});

// POST /admin/pages/:id/unpublish-section - Unpublish a page and all its descendants
router.post('/pages/:id/unpublish-section', async (req: Request, res: Response) => {
  const { id } = req.params;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get all descendant pages including the root page using recursive CTE
    const descendantsResult = await client.query(`
      WITH RECURSIVE descendants AS (
        -- Root page
        SELECT id FROM pages WHERE id = $1

        UNION ALL

        -- Child pages recursively
        SELECT p.id FROM pages p
        INNER JOIN descendants d ON p.parent_id = d.id
      )
      SELECT id FROM descendants
    `, [id]);

    if (descendantsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    // Unpublish all descendants
    const pageIds = descendantsResult.rows.map(r => r.id);

    const updateResult = await client.query(`
      UPDATE pages
      SET status = 'draft',
          current_draft_revision_id = COALESCE(current_draft_revision_id, current_published_revision_id)
      WHERE id = ANY($1)
    `, [pageIds]);

    await client.query('COMMIT');

    res.json({
      message: `Section unpublished: ${updateResult.rowCount} pages moved to draft`,
      unpublished_count: updateResult.rowCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error unpublishing section:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to unpublish section' });
  } finally {
    client.release();
  }
});

// DELETE /admin/pages/:id - Delete a page
router.delete('/pages/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(`
      DELETE FROM pages WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    res.json({ message: 'Page deleted successfully' });
  } catch (err) {
    console.error('Error deleting page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to delete page' });
  }
});

// Types for bulk operations
interface BulkResult {
  page_id: string;
  success: boolean;
  error?: string;
}

type BulkAction = 'publish' | 'unpublish' | 'delete';

// POST /admin/pages/bulk - Bulk operations on multiple pages
router.post('/pages/bulk', async (req: Request, res: Response) => {
  const { page_ids, action } = req.body as { page_ids: string[]; action: BulkAction };

  if (!Array.isArray(page_ids) || page_ids.length === 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'page_ids must be a non-empty array'
    });
  }

  // Limit array size to prevent DoS attacks
  const MAX_BULK_OPERATIONS = 100;
  if (page_ids.length > MAX_BULK_OPERATIONS) {
    return res.status(400).json({
      error: 'validation_error',
      message: `page_ids array exceeds maximum size of ${MAX_BULK_OPERATIONS}`
    });
  }

  if (!['publish', 'unpublish', 'delete'].includes(action)) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'action must be one of: publish, unpublish, delete'
    });
  }

  const results: BulkResult[] = [];
  const client = await getClient();

  try {
    await client.query('BEGIN');

    for (const page_id of page_ids) {
      try {
        // Check page exists
        const pageResult = await client.query(`
          SELECT id, current_draft_revision_id, current_published_revision_id
          FROM pages WHERE id = $1
        `, [page_id]);

        if (pageResult.rows.length === 0) {
          results.push({ page_id, success: false, error: 'Page not found' });
          continue;
        }

        const page = pageResult.rows[0];

        switch (action) {
          case 'publish': {
            const revisionToPublish = page.current_draft_revision_id || page.current_published_revision_id;
            if (!revisionToPublish) {
              results.push({ page_id, success: false, error: 'Page has no content to publish' });
              continue;
            }
            await client.query(`
              UPDATE pages
              SET status = 'published',
                  current_published_revision_id = $1,
                  current_draft_revision_id = NULL
              WHERE id = $2
            `, [revisionToPublish, page_id]);
            results.push({ page_id, success: true });
            break;
          }

          case 'unpublish':
            await client.query(`
              UPDATE pages
              SET status = 'draft',
                  current_draft_revision_id = COALESCE(current_draft_revision_id, current_published_revision_id)
              WHERE id = $1
            `, [page_id]);
            results.push({ page_id, success: true });
            break;

          case 'delete':
            await client.query(`DELETE FROM pages WHERE id = $1`, [page_id]);
            results.push({ page_id, success: true });
            break;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        results.push({ page_id, success: false, error: error.message || 'Unknown error' });
      }
    }

    await client.query('COMMIT');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      message: `Bulk ${action}: ${successCount} succeeded, ${failCount} failed`,
      results
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error in bulk operation:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to complete bulk operation' });
  } finally {
    client.release();
  }
});

// POST /admin/pages/reorder - Batch update sort_order for siblings
router.post('/pages/reorder', async (req: Request, res: Response) => {
  const { parent_id, page_ids } = req.body as { parent_id: string | null; page_ids: string[] };

  if (!Array.isArray(page_ids) || page_ids.length === 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'page_ids must be a non-empty array'
    });
  }

  // Limit array size to prevent DoS attacks
  const MAX_REORDER_OPERATIONS = 200;
  if (page_ids.length > MAX_REORDER_OPERATIONS) {
    return res.status(400).json({
      error: 'validation_error',
      message: `page_ids array exceeds maximum size of ${MAX_REORDER_OPERATIONS}`
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Validate all pages exist, have the correct parent, and lock them for update
    const existingResult = await client.query(`
      SELECT id, parent_id FROM pages WHERE id = ANY($1) FOR UPDATE
    `, [page_ids]);

    const existingIds = new Set(existingResult.rows.map(r => r.id));
    const missingIds = page_ids.filter(id => !existingIds.has(id));

    if (missingIds.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'validation_error',
        message: `Pages not found: ${missingIds.join(', ')}`
      });
    }

    // Check all pages have matching parent_id
    const wrongParent = existingResult.rows.filter(r =>
      (parent_id === null && r.parent_id !== null) ||
      (parent_id !== null && r.parent_id !== parent_id)
    );

    if (wrongParent.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'validation_error',
        message: 'All pages must have the same parent_id'
      });
    }

    // Batch update sort_order using a VALUES join
    // This is more efficient than multiple sequential UPDATEs and uses proper parameterization
    // Build parameterized values list: ($1, 0), ($2, 1), ...
    const valueParams = page_ids.map((_, i) => `($${i + 1}::uuid, ${i})`).join(', ');

    await client.query(`
      UPDATE pages p
      SET sort_order = v.sort_order
      FROM (VALUES ${valueParams}) AS v(id, sort_order)
      WHERE p.id = v.id
    `, page_ids);

    await client.query('COMMIT');

    res.json({
      message: `Reordered ${page_ids.length} pages`,
      parent_id,
      page_ids
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error reordering pages:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to reorder pages' });
  } finally {
    client.release();
  }
});

export { router as adminRouter };
