import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { timingSafeEqual } from 'crypto';
import { query, getClient } from '../db/client.js';
import {
  IngestJob,
  IngestItem,
  IngestRequest,
  IngestResponse,
  IngestJobResponse,
  IngestItemResponse,
  IngestJobStatus,
  IngestItemStatus,
  SourceType,
} from '../types.js';
import { backfillEmbeddings } from '../services/embeddings.js';

const router = Router();

// Auth middleware - same pattern as admin.ts
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const password = req.headers['x-admin-password'] as string;

  if (!process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD not set in environment');
    return res.status(500).json({ error: 'config_error', message: 'Server not configured for admin access' });
  }

  // Constant-time comparison to prevent timing attacks
  if (!password || !isValidPassword(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid admin password' });
  }

  next();
}

/**
 * Constant-time password comparison to prevent timing attacks
 */
function isValidPassword(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    // Still do timing-safe comparison to prevent length-based timing attacks
    timingSafeEqual(Buffer.from('dummy'), Buffer.from('dummy'));
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

// Apply auth to all ingest routes
router.use(authMiddleware);

// POST /admin/ingest - Submit items for ingestion (batch support)
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as IngestRequest;

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'items array is required and must not be empty'
    });
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create the job
    const jobId = uuidv4();
    const mode = body.mode || 'manual';
    const metadata = body.metadata || {};

    await client.query(`
      INSERT INTO ingest_jobs (id, status, mode, total_items, metadata)
      VALUES ($1, 'pending', $2, $3, $4)
    `, [jobId, mode, body.items.length, JSON.stringify(metadata)]);

    // Create the items
    const itemIds: string[] = [];
    for (const item of body.items) {
      const itemId = uuidv4();
      itemIds.push(itemId);

      // Validate source_type using the TypeScript enum values
      const validSourceTypes: SourceType[] = ['url', 'text', 'file', 'api'];
      if (!validSourceTypes.includes(item.source_type as SourceType)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'validation_error',
          message: `Invalid source_type: ${item.source_type}. Must be one of: ${validSourceTypes.join(', ')}`
        });
      }

      // Validate required fields based on source_type
      if (item.source_type === 'url') {
        if (!item.url) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'validation_error',
            message: 'url is required when source_type is "url"'
          });
        }

        // Validate URL format
        try {
          new URL(item.url);
        } catch {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'validation_error',
            message: `Invalid URL format: ${item.url}`
          });
        }
      }

      if (item.source_type === 'text') {
        if (!item.content) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'validation_error',
            message: 'content is required when source_type is "text"'
          });
        }

        // Validate content length (max 1MB)
        if (item.content.length > 1024 * 1024) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'validation_error',
            message: `Content too large: ${item.content.length} bytes. Maximum allowed is 1MB.`
          });
        }

        // Validate content isn't just whitespace
        if (item.content.trim().length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'validation_error',
            message: 'Content cannot be empty or only whitespace'
          });
        }
      }

      const itemMetadata = item.metadata || {};
      if (item.content_type) {
        (itemMetadata as Record<string, unknown>).content_type = item.content_type;
      }

      await client.query(`
        INSERT INTO ingest_items (id, job_id, source_type, source_url, source_content, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [itemId, jobId, item.source_type, item.url || null, item.content || null, JSON.stringify(itemMetadata)]);
    }

    await client.query('COMMIT');

    // Fetch the created job
    const jobResult = await query<IngestJob>(`
      SELECT id, status, mode, total_items, processed_items, failed_items,
             created_at, started_at, completed_at, error_message, metadata
      FROM ingest_jobs WHERE id = $1
    `, [jobId]);

    const response: IngestResponse = {
      job: jobResult.rows[0],
      message: `Created ingest job with ${body.items.length} item(s)`
    };

    res.status(201).json(response);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error creating ingest job:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to create ingest job' });
  } finally {
    client.release();
  }
});

// GET /admin/ingest/jobs - List jobs with pagination
router.get('/jobs', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);
  const offset = (page - 1) * limit;
  const status = req.query.status as IngestJobStatus | undefined;

  try {
    let whereClause = '';
    const params: (string | number)[] = [];

    if (status) {
      whereClause = 'WHERE status = $1';
      params.push(status);
    }

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ingest_jobs ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Get jobs
    const jobsResult = await query<IngestJob>(`
      SELECT id, status, mode, total_items, processed_items, failed_items,
             created_at, started_at, completed_at, error_message, metadata
      FROM ingest_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    res.json({
      jobs: jobsResult.rows,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching ingest jobs:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch ingest jobs' });
  }
});

// GET /admin/ingest/jobs/:id - Job detail with items
router.get('/jobs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const includeItems = req.query.items !== 'false'; // Default to including items

  try {
    // Get the job
    const jobResult = await query<IngestJob>(`
      SELECT id, status, mode, total_items, processed_items, failed_items,
             created_at, started_at, completed_at, error_message, metadata
      FROM ingest_jobs WHERE id = $1
    `, [id]);

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Ingest job not found' });
    }

    const response: IngestJobResponse = {
      job: jobResult.rows[0]
    };

    // Optionally include items
    if (includeItems) {
      const itemsResult = await query<IngestItem>(`
        SELECT id, job_id, source_type, source_url, source_content, status,
               extracted_title, extracted_summary, extracted_content,
               extracted_topics, extracted_entities, extraction_confidence,
               routing_decision, target_page_id, target_section,
               routing_reasoning, routing_confidence,
               created_at, processed_at, error_message, metadata
        FROM ingest_items
        WHERE job_id = $1
        ORDER BY created_at
      `, [id]);

      response.items = itemsResult.rows;
    }

    res.json(response);
  } catch (err) {
    console.error('Error fetching ingest job:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch ingest job' });
  }
});

// POST /admin/ingest/jobs/:id/retry - Retry failed items
router.post('/jobs/:id/retry', async (req: Request, res: Response) => {
  const { id } = req.params;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check job exists
    const jobResult = await client.query(`
      SELECT id, status, failed_items FROM ingest_jobs WHERE id = $1
    `, [id]);

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Ingest job not found' });
    }

    const job = jobResult.rows[0];

    // Reset failed items to pending
    const resetResult = await client.query(`
      UPDATE ingest_items
      SET status = 'pending', error_message = NULL, processed_at = NULL
      WHERE job_id = $1 AND status = 'failed'
      RETURNING id
    `, [id]);

    const resetCount = resetResult.rowCount || 0;

    // Update job counts - don't decrement processed_items as trigger will increment when items are reprocessed
    await client.query(`
      UPDATE ingest_jobs
      SET status = CASE WHEN $2 > 0 THEN 'pending' ELSE status END,
          failed_items = 0,
          completed_at = NULL,
          error_message = NULL
      WHERE id = $1
    `, [id, resetCount]);

    await client.query('COMMIT');

    res.json({
      message: `Reset ${resetCount} failed item(s) for retry`,
      reset_count: resetCount,
      job_id: id
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error retrying ingest job:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to retry ingest job' });
  } finally {
    client.release();
  }
});

// POST /admin/ingest/jobs/:id/items/:itemId/approve - Approve item for review mode
router.post('/jobs/:id/items/:itemId/approve', async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const { routing_decision, target_page_id, target_section } = req.body as {
    routing_decision?: string;
    target_page_id?: string;
    target_section?: string;
  };

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check item exists and belongs to job
    const itemResult = await client.query(`
      SELECT id, status, routing_decision FROM ingest_items
      WHERE id = $1 AND job_id = $2
    `, [itemId, id]);

    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Ingest item not found' });
    }

    const item = itemResult.rows[0];

    // Item should be in routing status for review mode
    if (item.status !== 'routing') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'invalid_status',
        message: `Cannot approve item with status "${item.status}". Item must be in "routing" status.`
      });
    }

    // Update item with approved routing decision
    const finalDecision = routing_decision || item.routing_decision;
    if (!finalDecision) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'validation_error',
        message: 'routing_decision is required when item has no existing routing decision'
      });
    }

    await client.query(`
      UPDATE ingest_items
      SET status = 'integrating',
          routing_decision = $1,
          target_page_id = COALESCE($2, target_page_id),
          target_section = COALESCE($3, target_section)
      WHERE id = $4
    `, [finalDecision, target_page_id || null, target_section || null, itemId]);

    await client.query('COMMIT');

    // Fetch updated item
    const updatedResult = await query<IngestItem>(`
      SELECT id, job_id, source_type, source_url, source_content, status,
             extracted_title, extracted_summary, extracted_content,
             extracted_topics, extracted_entities, extraction_confidence,
             routing_decision, target_page_id, target_section,
             routing_reasoning, routing_confidence,
             created_at, processed_at, error_message, metadata
      FROM ingest_items WHERE id = $1
    `, [itemId]);

    const response: IngestItemResponse = {
      item: updatedResult.rows[0]
    };

    res.json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error approving ingest item:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to approve ingest item' });
  } finally {
    client.release();
  }
});

// GET /admin/ingest/jobs/:id/items - List items for a job with filtering
router.get('/jobs/:id/items', async (req: Request, res: Response) => {
  const { id } = req.params;
  const status = req.query.status as IngestItemStatus | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
  const offset = (page - 1) * limit;

  try {
    // Check job exists
    const jobResult = await query(`SELECT id FROM ingest_jobs WHERE id = $1`, [id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Ingest job not found' });
    }

    let whereClause = 'WHERE job_id = $1';
    const params: (string | number)[] = [id];

    if (status) {
      whereClause += ' AND status = $2';
      params.push(status);
    }

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ingest_items ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Get items
    const itemsResult = await query<IngestItem>(`
      SELECT id, job_id, source_type, source_url, source_content, status,
             extracted_title, extracted_summary, extracted_content,
             extracted_topics, extracted_entities, extraction_confidence,
             routing_decision, target_page_id, target_section,
             routing_reasoning, routing_confidence,
             created_at, processed_at, error_message, metadata
      FROM ingest_items
      ${whereClause}
      ORDER BY created_at
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    res.json({
      items: itemsResult.rows,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching ingest items:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to fetch ingest items' });
  }
});

// DELETE /admin/ingest/jobs/:id - Cancel/delete a job
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const force = req.query.force === 'true';

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check job exists
    const jobResult = await client.query(`
      SELECT id, status FROM ingest_jobs WHERE id = $1
    `, [id]);

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found', message: 'Ingest job not found' });
    }

    const job = jobResult.rows[0];

    // Don't delete processing jobs unless forced
    if (job.status === 'processing' && !force) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'job_in_progress',
        message: 'Cannot delete job while processing. Use ?force=true to force deletion.'
      });
    }

    // Delete the job (items cascade delete)
    await client.query(`DELETE FROM ingest_jobs WHERE id = $1`, [id]);

    await client.query('COMMIT');

    res.json({ message: 'Ingest job deleted successfully', job_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting ingest job:', err);
    res.status(500).json({ error: 'database_error', message: 'Failed to delete ingest job' });
  } finally {
    client.release();
  }
});

// POST /admin/ingest/embeddings/backfill - Backfill embeddings for all published pages
router.post('/embeddings/backfill', async (_req: Request, res: Response) => {
  try {
    // Run backfill (this may take a while for large wikis)
    const stats = await backfillEmbeddings();

    res.json({
      message: `Backfill complete: ${stats.processed} processed, ${stats.failed} failed`,
      ...stats,
    });
  } catch (err: any) {
    console.error('Error backfilling embeddings:', err);
    res.status(500).json({ error: 'backfill_error', message: err.message || 'Failed to backfill embeddings' });
  }
});

export { router as ingestRouter };
