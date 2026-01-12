import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { Page, PageWithContent } from '../types.js';

const router = Router();

// Navigation tree node type
interface NavTreeNode {
  title: string;
  href: string;
  items: NavTreeNode[];
}

// GET /pages/nav - Get navigation sections (direct children of home only)
router.get('/nav', async (_req: Request, res: Response) => {
  try {
    // Find the home page (root page with slug 'home' or null parent)
    const homeResult = await query<Page>(`
      SELECT id FROM pages
      WHERE slug = 'home' AND status = 'published'
      LIMIT 1
    `);

    // Get direct children of home (these are the main sections)
    // If no home page exists, get root-level pages (parent_id IS NULL)
    const homeId = homeResult.rows[0]?.id;

    const result = await query<Page>(`
      SELECT id, slug, title, parent_id, sort_order
      FROM pages
      WHERE status = 'published'
        AND ${homeId ? 'parent_id = $1' : 'parent_id IS NULL AND slug != $1'}
      ORDER BY sort_order, title
    `, [homeId || 'home']);

    // Convert to navigation format (flat list of sections, no nested items)
    const navTree: NavTreeNode[] = result.rows.map(page => ({
      title: page.title,
      href: `/${page.slug}`,
      items: [], // No nested items in top navbar
    }));

    res.json({ nav: navTree });
  } catch (err) {
    console.error('Error fetching navigation:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch navigation' });
  }
});

// GET /pages - List all published pages
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query<Page>(`
      SELECT id, slug, title, status,
             current_published_revision_id, current_draft_revision_id,
             created_at, updated_at,
             parent_id, sort_order
      FROM pages
      WHERE status = 'published'
      ORDER BY title ASC
    `);

    res.json({ pages: result.rows });
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch pages' });
  }
});

// GET /pages/:slug - Get a single published page with content
router.get('/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;

  try {
    const result = await query<PageWithContent>(`
      SELECT p.id, p.slug, p.title, p.status,
             p.current_published_revision_id, p.current_draft_revision_id,
             p.created_at, p.updated_at,
             p.parent_id, p.sort_order,
             pr.content_md
      FROM pages p
      LEFT JOIN page_revisions pr ON p.current_published_revision_id = pr.id
      WHERE p.slug = $1 AND p.status = 'published'
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Page not found' });
    }

    res.json({ page: result.rows[0] });
  } catch (err) {
    console.error('Error fetching page:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch page' });
  }
});

export { router as pagesRouter };
