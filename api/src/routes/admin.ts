import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../db/client.js';
import { Page, PageWithContent, CreatePageRequest, UpdatePageRequest } from '../types.js';

const router = Router();

// Auth middleware - MVP with password header
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const password = req.headers['x-admin-password'] as string;

  if (!process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD not set in environment');
    return res.status(500).json({ error: 'config_error', message: 'Server not configured for admin access' });
  }

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid admin password' });
  }

  next();
}

// Apply auth to all admin routes
router.use(authMiddleware);

// GET /admin/pages - List all pages (including drafts and private)
router.get('/pages', async (_req: Request, res: Response) => {
  try {
    const result = await query<Page>(`
      SELECT id, slug, title, status, visibility,
             current_published_revision_id, current_draft_revision_id,
             created_at, updated_at
      FROM pages
      ORDER BY updated_at DESC
    `);

    res.json({ pages: result.rows });
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch pages' });
  }
});

// GET /admin/pages/:id - Get a single page with content (draft if exists, else published)
router.get('/pages/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // First get the page
    const pageResult = await query<Page>(`
      SELECT id, slug, title, status, visibility,
             current_published_revision_id, current_draft_revision_id,
             created_at, updated_at
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
  const body = req.body as CreatePageRequest;

  if (!body.slug || !body.title || !body.content_md) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'slug, title, and content_md are required'
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const pageId = uuidv4();
    const revisionId = uuidv4();
    const status = body.status || 'draft';
    const visibility = body.visibility || 'public';

    // Create the revision first
    await client.query(`
      INSERT INTO page_revisions (id, page_id, content_md, author_type)
      VALUES ($1, $2, $3, 'human')
    `, [revisionId, pageId, body.content_md]);

    // Create the page with revision reference
    const publishedRevId = status === 'published' ? revisionId : null;
    const draftRevId = status === 'draft' ? revisionId : null;

    await client.query(`
      INSERT INTO pages (id, slug, title, status, visibility, current_published_revision_id, current_draft_revision_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [pageId, body.slug, body.title, status, visibility, publishedRevId, draftRevId]);

    await client.query('COMMIT');

    res.status(201).json({
      page: {
        id: pageId,
        slug: body.slug,
        title: body.title,
        status,
        visibility,
        current_published_revision_id: publishedRevId,
        current_draft_revision_id: draftRevId,
        content_md: body.content_md
      }
    });
  } catch (err: any) {
    await client.query('ROLLBACK');

    if (err.code === '23505') { // unique violation
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

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check page exists
    const existingResult = await client.query(`
      SELECT id, slug, title, visibility, current_draft_revision_id, current_published_revision_id
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
    const title = body.title ?? existing.title;
    const visibility = body.visibility ?? existing.visibility;

    await client.query(`
      UPDATE pages
      SET title = $1, visibility = $2, current_draft_revision_id = $3
      WHERE id = $4
    `, [title, visibility, newDraftRevisionId, id]);

    await client.query('COMMIT');

    res.json({
      message: 'Page updated',
      page: {
        id,
        slug: existing.slug,
        title,
        visibility,
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

// POST /admin/pages/:id/unpublish - Unpublish a page (move to draft)
router.post('/pages/:id/unpublish', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(`
      UPDATE pages
      SET status = 'draft',
          current_draft_revision_id = COALESCE(current_draft_revision_id, current_published_revision_id)
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    res.json({ message: 'Page unpublished successfully' });
  } catch (err) {
    console.error('Error unpublishing page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to unpublish page' });
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

export { router as adminRouter };
