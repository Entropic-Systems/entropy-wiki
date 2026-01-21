import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password';
const TEST_TIMEOUT = 60000; // 60s for Claude CLI
const IS_CI = process.env.CI === 'true';

// Skip slow pipeline tests in CI (require Claude CLI + take 60-120s each)
const itSkipCI = IS_CI ? it.skip : it;
const describeSkipCI = IS_CI ? describe.skip : describe;

/**
 * E2E Tests for Claude Headless Ingest Flow
 *
 * These tests verify the full ingest pipeline:
 * 1. Submit ingest job via POST /admin/ingest
 * 2. Background processor picks up the job
 * 3. Extraction stage (cheerio/extractors)
 * 4. Routing stage (Claude CLI)
 * 5. Integration stage (Claude CLI)
 * 6. Embeddings generation (local HuggingFace)
 * 7. Database persistence (pages, revisions, embeddings)
 *
 * NOTE: These tests require:
 * - Claude CLI installed and authenticated (`claude --version`)
 * - PostgreSQL database running
 * - Background processor enabled
 */

describe('Ingest E2E (Claude Headless)', () => {
  // Helper: Poll for job completion
  async function pollJobCompletion(jobId: string, timeout: number): Promise<any> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const res = await request(app)
        .get(`/admin/ingest/jobs/${jobId}`)
        .set('X-Admin-Password', ADMIN_PASSWORD);

      if (res.status !== 200) {
        throw new Error(`Failed to get job status: ${res.status}`);
      }

      const job = res.body.job;

      if (job.status === 'completed' || job.status === 'failed') {
        return { ...job, items: res.body.items };
      }

      await new Promise((r) => setTimeout(r, 2000)); // Poll every 2s
    }

    throw new Error(`Timeout waiting for job ${jobId}`);
  }

  describe('Local Embeddings', () => {
    it('should generate 384-dim embeddings', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');
      const embedding = await generateEmbedding('Test content for embeddings');

      expect(embedding.length).toBe(384);
      expect(embedding.every((n: number) => typeof n === 'number')).toBe(true);

      // Check it's normalized (unit length)
      const norm = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 2);
    });

    it('should return consistent embeddings for same content', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');

      const text = 'Consistent embedding test';
      const embedding1 = await generateEmbedding(text);
      const embedding2 = await generateEmbedding(text);

      // Should be identical
      expect(embedding1.length).toBe(embedding2.length);
      for (let i = 0; i < embedding1.length; i++) {
        expect(embedding1[i]).toBeCloseTo(embedding2[i], 10);
      }
    });

    it('should return different embeddings for different content', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');

      const embedding1 = await generateEmbedding('TypeScript programming');
      const embedding2 = await generateEmbedding('Cooking recipes');

      // Cosine similarity should be low
      let dotProduct = 0;
      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
      }

      // Unrelated topics should have lower similarity
      expect(dotProduct).toBeLessThan(0.8);
    });
  });

  describeSkipCI('Claude Headless Service', () => {
    it(
      'should execute Claude CLI and return response',
      async () => {
        const { callClaude } = await import('../src/services/claude-headless.js');

        const response = await callClaude('Say "test passed" and nothing else.');

        expect(response.toLowerCase()).toContain('test');
      },
      TEST_TIMEOUT
    );

    it(
      'should extract JSON from markdown code blocks',
      async () => {
        const { callClaude } = await import('../src/services/claude-headless.js');

        const response = await callClaude(
          'Respond with exactly this JSON in a code block: {"status": "ok", "value": 42}',
          { extractJson: true }
        );

        const parsed = JSON.parse(response);
        expect(parsed.status).toBe('ok');
        expect(parsed.value).toBe(42);
      },
      TEST_TIMEOUT
    );

    it(
      'should handle long prompts',
      async () => {
        const { callClaude } = await import('../src/services/claude-headless.js');

        const longText = 'A'.repeat(5000);
        const response = await callClaude(
          `Count the number of A characters in this string (it's 5000): ${longText}\n\nRespond with just the count.`
        );

        // Should respond without error
        expect(response.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );
  });

  describe('Full Pipeline Test', () => {
    it(
      'should create an ingest job',
      async () => {
        const jobRes = await request(app)
          .post('/admin/ingest')
          .set('X-Admin-Password', ADMIN_PASSWORD)
          .send({
            items: [
              {
                source_type: 'text',
                content: '# E2E Test Page\n\nThis is test content created by the E2E test suite.',
              },
            ],
          });

        expect(jobRes.status).toBe(201);
        expect(jobRes.body.job).toBeDefined();
        expect(jobRes.body.job.id).toBeDefined();
        expect(jobRes.body.job.status).toBe('pending');
        expect(jobRes.body.job.total_items).toBe(1);
      }
    );

    itSkipCI(
      'should ingest text content and process through pipeline',
      async () => {
        // 1. Submit ingest job
        const timestamp = Date.now();
        const jobRes = await request(app)
          .post('/admin/ingest')
          .set('X-Admin-Password', ADMIN_PASSWORD)
          .send({
            items: [
              {
                source_type: 'text',
                content: `# TypeScript Testing Guide ${timestamp}\n\nLearn how to test TypeScript apps with Vitest. This is a comprehensive guide covering unit tests, integration tests, and E2E tests.`,
              },
            ],
          });

        expect(jobRes.status).toBe(201);
        const jobId = jobRes.body.job.id;

        // 2. Poll for completion (60s timeout for Claude CLI)
        const completed = await pollJobCompletion(jobId, 60000);

        // 3. Verify job completed
        expect(completed.status).toBe('completed');
        expect(completed.processed_items).toBe(1);
        expect(completed.failed_items).toBe(0);

        // 4. Verify item was processed
        expect(completed.items).toBeDefined();
        expect(completed.items.length).toBe(1);

        const item = completed.items[0];
        expect(item.status).toBe('completed');
        expect(item.routing_decision).toMatch(/new_page|update_page|merge/);
      },
      TEST_TIMEOUT
    );

    itSkipCI(
      'should handle multiple items in batch',
      async () => {
        const timestamp = Date.now();
        const jobRes = await request(app)
          .post('/admin/ingest')
          .set('X-Admin-Password', ADMIN_PASSWORD)
          .send({
            items: [
              {
                source_type: 'text',
                content: `# First Topic ${timestamp}\n\nContent for first topic.`,
              },
              {
                source_type: 'text',
                content: `# Second Topic ${timestamp}\n\nContent for second topic.`,
              },
            ],
          });

        expect(jobRes.status).toBe(201);
        expect(jobRes.body.job.total_items).toBe(2);

        const jobId = jobRes.body.job.id;

        // Poll for completion (2 items, may take longer)
        const completed = await pollJobCompletion(jobId, 120000);

        expect(completed.status).toBe('completed');
        expect(completed.processed_items).toBe(2);
      },
      120000 // 2 minute timeout for batch test
    );
  });

  describe('API Validation', () => {
    it('should reject ingest without auth', async () => {
      const res = await request(app)
        .post('/admin/ingest')
        .send({
          items: [{ source_type: 'text', content: 'Test' }],
        });

      expect(res.status).toBe(401);
    });

    it('should reject ingest with wrong password', async () => {
      const res = await request(app)
        .post('/admin/ingest')
        .set('X-Admin-Password', 'wrong-password')
        .send({
          items: [{ source_type: 'text', content: 'Test' }],
        });

      expect(res.status).toBe(401);
    });

    it('should reject empty items array', async () => {
      const res = await request(app)
        .post('/admin/ingest')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({ items: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should reject invalid source_type', async () => {
      const res = await request(app)
        .post('/admin/ingest')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          items: [{ source_type: 'invalid', content: 'Test' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should reject text source without content', async () => {
      const res = await request(app)
        .post('/admin/ingest')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          items: [{ source_type: 'text' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('should reject url source without url', async () => {
      const res = await request(app)
        .post('/admin/ingest')
        .set('X-Admin-Password', ADMIN_PASSWORD)
        .send({
          items: [{ source_type: 'url' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });
  });

  describe('Job Status API', () => {
    it('should list ingest jobs', async () => {
      const res = await request(app)
        .get('/admin/ingest/jobs')
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(res.status).toBe(200);
      expect(res.body.jobs).toBeDefined();
      expect(Array.isArray(res.body.jobs)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter jobs by status', async () => {
      const res = await request(app)
        .get('/admin/ingest/jobs?status=completed')
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(res.status).toBe(200);
      for (const job of res.body.jobs) {
        expect(job.status).toBe('completed');
      }
    });

    it('should return 404 for non-existent job', async () => {
      const res = await request(app)
        .get('/admin/ingest/jobs/00000000-0000-0000-0000-000000000000')
        .set('X-Admin-Password', ADMIN_PASSWORD);

      expect(res.status).toBe(404);
    });
  });
});
