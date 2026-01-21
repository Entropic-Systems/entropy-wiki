import { query, getClient } from '../db/client.js';
import { extractContent } from './extractor.js';
import { routeContent } from './router.js';
import { integrateContent, IntegrationOptions } from './integrator.js';
import { IngestJob, IngestItem, SourceType, ContentType } from '../types.js';

// Configuration
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 2min

// Processing state
let isProcessing = false;
let processingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background job processor
 */
export function startProcessor(): void {
  if (processingInterval) {
    console.log('Processor already running');
    return;
  }

  console.log('Starting ingest job processor...');
  processingInterval = setInterval(pollForJobs, POLL_INTERVAL_MS);

  // Process immediately on startup
  pollForJobs();
}

/**
 * Stop the background job processor
 */
export function stopProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log('Ingest job processor stopped');
  }
}

/**
 * Poll for pending jobs and process them
 */
async function pollForJobs(): Promise<void> {
  if (isProcessing) {
    return; // Skip if already processing
  }

  try {
    isProcessing = true;

    // Find pending jobs
    const jobsResult = await query<IngestJob>(`
      SELECT id, status, mode, total_items, processed_items, failed_items,
             created_at, started_at, completed_at, error_message, metadata
      FROM ingest_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `);

    if (jobsResult.rows.length === 0) {
      return; // No pending jobs
    }

    const job = jobsResult.rows[0];
    await processJob(job);
  } catch (error) {
    console.error('Error polling for jobs:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Process a single ingest job
 */
async function processJob(job: IngestJob): Promise<void> {
  console.log(`Processing job ${job.id}...`);

  const client = await getClient();

  try {
    // Mark job as processing
    await client.query(`
      UPDATE ingest_jobs
      SET status = 'processing', started_at = NOW()
      WHERE id = $1
    `, [job.id]);
    client.release();

    // Get all pending items for this job
    const itemsResult = await query<IngestItem>(`
      SELECT *
      FROM ingest_items
      WHERE job_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
    `, [job.id]);

    // Process each item
    for (const item of itemsResult.rows) {
      await processItem(item, job);
    }

    // Check if job is complete
    await updateJobStatus(job.id);

    console.log(`Completed processing job ${job.id}`);
  } catch (error: any) {
    console.error(`Error processing job ${job.id}:`, error);

    // Mark job as failed
    await query(`
      UPDATE ingest_jobs
      SET status = 'failed', error_message = $1, completed_at = NOW()
      WHERE id = $2
    `, [error.message || 'Unknown error', job.id]);
  }
}

/**
 * Process a single ingest item through the pipeline
 */
async function processItem(item: IngestItem, job: IngestJob): Promise<void> {
  console.log(`Processing item ${item.id} (${item.source_type})...`);

  const retryCount = (item.metadata as Record<string, number>)?.retry_count || 0;

  try {
    // Stage 1: Extraction
    await updateItemStatus(item.id, 'extracting');

    const source = item.source_url || item.source_content || '';
    const contentType = (item.metadata as Record<string, ContentType>)?.content_type;

    const extracted = await extractContent(source, contentType);

    // Save extraction results
    // Note: topics must be cast to TEXT[] for PostgreSQL type inference
    await query(`
      UPDATE ingest_items
      SET extracted_title = $1,
          extracted_summary = $2,
          extracted_content = $3,
          extracted_topics = $4::TEXT[],
          extracted_entities = $5,
          extraction_confidence = $6
      WHERE id = $7
    `, [
      extracted.title,
      extracted.summary,
      extracted.content,
      extracted.topics || [],
      extracted.entities ? JSON.stringify(extracted.entities) : null,
      extracted.confidence,
      item.id,
    ]);

    // Check extraction success
    if (!extracted.content && !extracted.summary) {
      throw new Error('Content extraction failed - no content extracted');
    }

    // Stage 2: Routing
    await updateItemStatus(item.id, 'routing');

    const routing = await routeContent(extracted, item.source_url || undefined);

    // Save routing results
    await query(`
      UPDATE ingest_items
      SET routing_decision = $1,
          target_page_id = $2,
          target_section = $3,
          routing_reasoning = $4,
          routing_confidence = $5
      WHERE id = $6
    `, [
      routing.decision,
      routing.target_page_id,
      routing.target_section,
      routing.reasoning,
      routing.confidence,
      item.id,
    ]);

    // Check if review mode - pause for approval
    const jobMetadata = job.metadata as Record<string, string>;
    if (jobMetadata?.review_mode === 'true') {
      // Leave in routing status for manual review
      console.log(`Item ${item.id} awaiting review`);
      return;
    }

    // Stage 3: Integration
    await updateItemStatus(item.id, 'integrating');

    const integrationOptions: IntegrationOptions = {
      mode: job.mode === 'manual' ? 'review' : 'automatic',
      sourceUrl: item.source_url || undefined,
    };

    const result = await integrateContent(extracted, routing, integrationOptions);

    // Save integration results
    if (result.success) {
      await query(`
        UPDATE ingest_items
        SET status = 'completed',
            target_page_id = COALESCE($1, target_page_id),
            processed_at = NOW(),
            metadata = metadata || $2::jsonb
        WHERE id = $3
      `, [
        result.page_id,
        JSON.stringify({
          result_page_id: result.page_id,
          result_revision_id: result.revision_id,
          result_action: result.action,
          result_slug: result.slug,
        }),
        item.id,
      ]);
    } else {
      throw new Error(result.error || 'Integration failed');
    }

    console.log(`Successfully processed item ${item.id}: ${result.action}`);
  } catch (error: any) {
    console.error(`Error processing item ${item.id}:`, error.message);

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`Will retry item ${item.id} in ${delay / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);

      await query(`
        UPDATE ingest_items
        SET status = 'pending',
            error_message = $1,
            metadata = metadata || $2::jsonb
        WHERE id = $3
      `, [
        error.message,
        JSON.stringify({ retry_count: retryCount + 1, last_retry: new Date().toISOString() }),
        item.id,
      ]);

      // Schedule retry (simple timeout, could use proper job queue)
      setTimeout(() => {
        pollForJobs().catch(console.error);
      }, delay);
    } else {
      // Max retries exceeded
      await query(`
        UPDATE ingest_items
        SET status = 'failed',
            error_message = $1,
            processed_at = NOW()
        WHERE id = $2
      `, [`Max retries exceeded: ${error.message}`, item.id]);
    }
  }
}

/**
 * Update item status
 */
async function updateItemStatus(itemId: string, status: string): Promise<void> {
  await query(`
    UPDATE ingest_items SET status = $1 WHERE id = $2
  `, [status, itemId]);
}

/**
 * Update job status based on item completion
 */
async function updateJobStatus(jobId: string): Promise<void> {
  // Get item counts
  const countsResult = await query<{
    total: string;
    completed: string;
    failed: string;
    pending: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status IN ('pending', 'extracting', 'routing', 'integrating')) as pending
    FROM ingest_items
    WHERE job_id = $1
  `, [jobId]);

  const counts = countsResult.rows[0];
  const total = parseInt(counts.total);
  const completed = parseInt(counts.completed);
  const failed = parseInt(counts.failed);
  const pending = parseInt(counts.pending);

  let status: string;
  if (pending > 0) {
    status = 'processing';
  } else if (failed === total) {
    status = 'failed';
  } else {
    status = 'completed';
  }

  await query(`
    UPDATE ingest_jobs
    SET status = $1::VARCHAR,
        processed_items = $2,
        failed_items = $3,
        completed_at = CASE WHEN $1::VARCHAR IN ('completed', 'failed') THEN NOW() ELSE completed_at END
    WHERE id = $4
  `, [status, completed + failed, failed, jobId]);
}

/**
 * Manually trigger processing of a specific job
 */
export async function triggerJobProcessing(jobId: string): Promise<void> {
  const jobResult = await query<IngestJob>(`
    SELECT * FROM ingest_jobs WHERE id = $1
  `, [jobId]);

  if (jobResult.rows.length === 0) {
    throw new Error('Job not found');
  }

  const job = jobResult.rows[0];

  if (job.status === 'processing') {
    throw new Error('Job is already being processed');
  }

  // Reset to pending if failed
  if (job.status === 'failed' || job.status === 'completed') {
    await query(`
      UPDATE ingest_jobs SET status = 'pending', error_message = NULL
      WHERE id = $1
    `, [jobId]);
  }

  // Trigger processing
  pollForJobs().catch(console.error);
}

/**
 * Resume processing of a reviewed item
 */
export async function resumeItemProcessing(itemId: string): Promise<void> {
  const itemResult = await query<IngestItem>(`
    SELECT * FROM ingest_items WHERE id = $1
  `, [itemId]);

  if (itemResult.rows.length === 0) {
    throw new Error('Item not found');
  }

  const item = itemResult.rows[0];

  if (item.status !== 'routing') {
    throw new Error('Item is not awaiting review');
  }

  // Get job
  const jobResult = await query<IngestJob>(`
    SELECT * FROM ingest_jobs WHERE id = $1
  `, [item.job_id]);

  if (jobResult.rows.length === 0) {
    throw new Error('Job not found');
  }

  // Continue processing
  await processItemIntegration(item, jobResult.rows[0]);
}

/**
 * Process just the integration stage for a reviewed item
 */
async function processItemIntegration(item: IngestItem, job: IngestJob): Promise<void> {
  try {
    await updateItemStatus(item.id, 'integrating');

    // Reconstruct extracted content
    const extracted = {
      title: item.extracted_title,
      summary: item.extracted_summary,
      content: item.extracted_content,
      topics: item.extracted_topics || [],
      entities: item.extracted_entities,
      confidence: item.extraction_confidence,
    };

    // Reconstruct routing decision
    const routing = {
      decision: item.routing_decision!,
      target_page_id: item.target_page_id,
      target_section: item.target_section,
      reasoning: item.routing_reasoning || '',
      suggested_slug: null,
      suggested_title: item.extracted_title,
      confidence: item.routing_confidence || 0.7,
      similar_pages: [],
    };

    const integrationOptions: IntegrationOptions = {
      mode: 'automatic', // After review, proceed automatically
      sourceUrl: item.source_url || undefined,
    };

    const result = await integrateContent(extracted, routing, integrationOptions);

    if (result.success) {
      await query(`
        UPDATE ingest_items
        SET status = 'completed',
            target_page_id = COALESCE($1, target_page_id),
            processed_at = NOW()
        WHERE id = $2
      `, [result.page_id, item.id]);
    } else {
      throw new Error(result.error || 'Integration failed');
    }

    // Update job status
    await updateJobStatus(job.id);
  } catch (error: any) {
    await query(`
      UPDATE ingest_items
      SET status = 'failed',
          error_message = $1,
          processed_at = NOW()
      WHERE id = $2
    `, [error.message, item.id]);

    await updateJobStatus(job.id);
  }
}

export { POLL_INTERVAL_MS, MAX_RETRIES };
