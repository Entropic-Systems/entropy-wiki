/**
 * Integrator Service Tests
 *
 * Comprehensive tests for AI content integration and database transaction logic.
 * Tests the core content persistence and AI integration workflows.
 *
 * Strategy:
 * - Real embeddings generation and storage (not mocked)
 * - Real database transactions and persistence
 * - Claude AI calls mocked (external dependency)
 * - Complete transaction rollback and error handling validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createNewPage,
  enhanceExistingPage,
  integrateContent,
  IntegrationOptions,
  IntegrationResult
} from '../../src/services/integrator.js';
import { TestDatabase } from '../utils/test-database.js';
import { claudeMock, mockManager } from '../utils/mocks/index.js';
import { ExtractedContent } from '../../src/types.js';
import { RoutingResult } from '../../src/services/router.js';

describe('Integrator Service', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    // Create isolated test database with real schema
    testDb = await TestDatabase.create('integrator-service-test');

    // Setup mock manager with defaults
    mockManager.setupDefaults();
  }, 60000); // Increase timeout for database setup

  afterEach(async () => {
    mockManager.reset();
    await testDb.cleanup();
  }, 30000);

  describe('createNewPage', () => {
    const sampleContent: ExtractedContent = {
      title: 'Sample Article',
      summary: 'This is a test article about Claude integration patterns.',
      content: 'Detailed content about implementing Claude in production systems...',
      topics: ['claude-api', 'integration', 'testing'],
      entities: { concepts: ['AI', 'API'], tools: ['Claude'] },
      confidence: 0.95
    };

    const sampleRouting: RoutingResult = {
      decision: 'new_page',
      target_page_id: null,
      target_section: null,
      reasoning: 'Content is sufficiently unique to warrant a new page',
      suggested_slug: 'claude-integration-patterns',
      suggested_title: 'Claude Integration Patterns',
      confidence: 0.89,
      similar_pages: []
    };

    const automaticOptions: IntegrationOptions = {
      mode: 'automatic',
      sourceUrl: 'https://example.com/article',
      sourceAttribution: 'Example Tech Blog'
    };

    it('should successfully create a new published page with real embeddings', async () => {
      // Setup Claude mock to return well-formatted wiki content
      claudeMock.setupContentGeneration(`## Overview

Claude Integration Patterns provides guidance for implementing Claude AI in production systems.

## Key Concepts

- **API Authentication**: Secure token management
- **Rate Limiting**: Handling API limits gracefully
- **Error Handling**: Robust error recovery patterns

## Implementation Examples

\`\`\`typescript
const claude = new ClaudeClient(apiKey);
const response = await claude.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1000,
  messages: [{ role: 'user', content: 'Hello' }]
});
\`\`\`

## Best Practices

1. Always validate responses
2. Implement retry logic
3. Monitor token usage
4. Cache responses when appropriate

---
*Source: [Example Tech Blog](https://example.com/article)*`);

      const result = await createNewPage(sampleContent, sampleRouting, automaticOptions);

      // Validate successful creation
      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.page_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(result.slug).toBe('claude-integration-patterns');
      expect(result.title).toBe('Claude Integration Patterns');

      // Validate database record creation
      const pool = testDb.getPool();

      // Check page was created
      const pageResult = await pool.query(
        'SELECT * FROM pages WHERE id = $1',
        [result.page_id]
      );
      expect(pageResult.rows).toHaveLength(1);
      const page = pageResult.rows[0];
      expect(page.slug).toBe('claude-integration-patterns');
      expect(page.title).toBe('Claude Integration Patterns');
      expect(page.status).toBe('published');

      // Check revision was created with AI authorship
      const revisionResult = await pool.query(
        'SELECT * FROM page_revisions WHERE id = $1',
        [result.revision_id]
      );
      expect(revisionResult.rows).toHaveLength(1);
      const revision = revisionResult.rows[0];
      expect(revision.page_id).toBe(result.page_id);
      expect(revision.author_type).toBe('ai');
      expect(revision.content_md).toContain('Claude Integration Patterns');
      expect(revision.content_md).toContain('Example Tech Blog');

      // Validate embeddings were generated (real implementation)
      const embeddingResult = await pool.query(
        'SELECT * FROM page_embeddings WHERE page_id = $1',
        [result.page_id]
      );
      expect(embeddingResult.rows).toHaveLength(1);
      const embedding = embeddingResult.rows[0];
      expect(embedding.revision_id).toBe(result.revision_id);
      expect(embedding.embedding).toBeDefined();
      expect(Array.isArray(embedding.embedding)).toBe(true);
      expect(embedding.embedding).toHaveLength(384); // Verify vector dimensions
    });

    it('should create draft page in review mode', async () => {
      claudeMock.setupContentGeneration('## Draft Content\n\nThis is draft content for review.');

      const reviewOptions: IntegrationOptions = {
        mode: 'review',
        sourceUrl: 'https://example.com/draft'
      };

      const result = await createNewPage(sampleContent, sampleRouting, reviewOptions);

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');

      // Check page is in draft status
      const pool = testDb.getPool();
      const pageResult = await pool.query(
        'SELECT status FROM pages WHERE id = $1',
        [result.page_id]
      );
      expect(pageResult.rows[0].status).toBe('draft');

      // Check no embeddings were generated for draft
      const embeddingResult = await pool.query(
        'SELECT * FROM page_embeddings WHERE page_id = $1',
        [result.page_id]
      );
      expect(embeddingResult.rows).toHaveLength(0);
    });

    it('should handle unique slug conflicts gracefully', async () => {
      claudeMock.setupContentGeneration('## Test Content\n\nThis is test content.');

      // Create first page
      const firstResult = await createNewPage(sampleContent, sampleRouting, automaticOptions);
      expect(firstResult.success).toBe(true);

      // Create second page with same suggested slug
      const secondResult = await createNewPage(sampleContent, sampleRouting, automaticOptions);
      expect(secondResult.success).toBe(true);
      expect(secondResult.slug).toBe('claude-integration-patterns-2');

      // Verify both pages exist with different slugs
      const pool = testDb.getPool();
      const pagesResult = await pool.query(
        'SELECT slug FROM pages ORDER BY slug'
      );
      expect(pagesResult.rows).toHaveLength(2);
      expect(pagesResult.rows[0].slug).toBe('claude-integration-patterns');
      expect(pagesResult.rows[1].slug).toBe('claude-integration-patterns-2');
    });

    it('should rollback transaction on database errors', async () => {
      claudeMock.setupContentGeneration('## Test Content\n\nThis is test content.');

      // Create a page with an invalid UUID to trigger constraint violation
      const invalidRouting: RoutingResult = {
        ...sampleRouting,
        suggested_slug: 'x'.repeat(200) // Exceed slug length limit
      };

      const result = await createNewPage(sampleContent, invalidRouting, automaticOptions);

      // Should handle error gracefully
      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toBeDefined();

      // Verify no database records were created
      const pool = testDb.getPool();
      const pageCount = await pool.query('SELECT COUNT(*) FROM pages');
      expect(parseInt(pageCount.rows[0].count)).toBe(0);

      const revisionCount = await pool.query('SELECT COUNT(*) FROM page_revisions');
      expect(parseInt(revisionCount.rows[0].count)).toBe(0);
    });

    it('should handle Claude API failures with fallback content', async () => {
      // Mock Claude API failure
      claudeMock.simulateRateLimit();

      const result = await createNewPage(sampleContent, sampleRouting, automaticOptions);

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');

      // Verify fallback content was used
      const pool = testDb.getPool();
      const revisionResult = await pool.query(
        'SELECT content_md FROM page_revisions WHERE id = $1',
        [result.revision_id]
      );
      const content = revisionResult.rows[0].content_md;

      // Should contain original content and attribution
      expect(content).toContain(sampleContent.summary);
      expect(content).toContain(sampleContent.content);
      expect(content).toContain('Topics:');
      expect(content).toContain('Example Tech Blog');
    });

    it('should generate embeddings for published content only', async () => {
      claudeMock.setupContentGeneration('## Published Content\n\nThis content will get embeddings.');

      // Create published page
      const publishedResult = await createNewPage(sampleContent, sampleRouting, automaticOptions);

      // Create draft page
      const draftOptions = { ...automaticOptions, mode: 'review' as const };
      const draftRouting = { ...sampleRouting, suggested_slug: 'draft-page' };
      const draftResult = await createNewPage(sampleContent, draftRouting, draftOptions);

      // Verify embeddings
      const pool = testDb.getPool();

      const publishedEmbeddings = await pool.query(
        'SELECT * FROM page_embeddings WHERE page_id = $1',
        [publishedResult.page_id]
      );
      expect(publishedEmbeddings.rows).toHaveLength(1);

      const draftEmbeddings = await pool.query(
        'SELECT * FROM page_embeddings WHERE page_id = $1',
        [draftResult.page_id]
      );
      expect(draftEmbeddings.rows).toHaveLength(0);
    });
  });

  describe('enhanceExistingPage', () => {
    let existingPageId: string;

    beforeEach(async () => {
      // Create an existing page to enhance
      const pool = testDb.getPool();

      existingPageId = '00000000-0000-0000-0000-000000000001';
      const revisionId = '00000000-0000-0000-0000-000000000002';

      // First create the page without revision references
      await pool.query(`
        INSERT INTO pages (id, slug, title, status)
        VALUES ($1, 'existing-page', 'Existing Page', 'published')
      `, [existingPageId]);

      // Create the revision
      await pool.query(`
        INSERT INTO page_revisions (id, page_id, content_md, author_type)
        VALUES ($1, $2, $3, 'human')
      `, [revisionId, existingPageId, `## Existing Content

This is the original content of the page.

### Current Section

Some existing information.`]);

      // Update the page with revision reference
      await pool.query(`
        UPDATE pages
        SET current_published_revision_id = $1
        WHERE id = $2
      `, [revisionId, existingPageId]);
    });

    const enhancementContent: ExtractedContent = {
      title: 'Additional Information',
      summary: 'New insights about the topic.',
      content: 'This provides additional context and examples...',
      topics: ['enhancement', 'update'],
      entities: { concepts: ['improvement'] },
      confidence: 0.88
    };

    const enhancementRouting: RoutingResult = {
      decision: 'update_page',
      target_page_id: '00000000-0000-0000-0000-000000000001',
      target_section: 'Additional Information',
      reasoning: 'Content enhances existing page with new information',
      suggested_slug: null,
      suggested_title: null,
      confidence: 0.92,
      similar_pages: []
    };

    it('should successfully enhance existing page in automatic mode', async () => {
      claudeMock.setupContentMerge(`## Existing Content

This is the original content of the page.

### Current Section

Some existing information.

### Additional Information

This provides additional context and examples...

New insights about the topic.

*Source: [Enhancement Source](https://example.com/enhancement)*`);

      const automaticOptions: IntegrationOptions = {
        mode: 'automatic',
        sourceUrl: 'https://example.com/enhancement',
        sourceAttribution: 'Enhancement Source'
      };

      const result = await enhanceExistingPage(
        enhancementContent,
        enhancementRouting,
        automaticOptions
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');
      expect(result.page_id).toBe(existingPageId);

      // Verify new revision was created
      const pool = testDb.getPool();
      const revisionResult = await pool.query(
        'SELECT content_md FROM page_revisions WHERE id = $1',
        [result.revision_id]
      );
      const mergedContent = revisionResult.rows[0].content_md;

      expect(mergedContent).toContain('Existing Content');
      expect(mergedContent).toContain('Additional Information');
      expect(mergedContent).toContain('Enhancement Source');

      // Verify page was updated with new revision
      const pageResult = await pool.query(
        'SELECT current_published_revision_id, current_draft_revision_id FROM pages WHERE id = $1',
        [existingPageId]
      );
      expect(pageResult.rows[0].current_published_revision_id).toBe(result.revision_id);
      expect(pageResult.rows[0].current_draft_revision_id).toBeNull();
    });

    it('should create draft revision in review mode', async () => {
      claudeMock.setupContentMerge(`## Enhanced Content (Review)

Original content with suggested improvements...`);

      const reviewOptions: IntegrationOptions = {
        mode: 'review',
        sourceUrl: 'https://example.com/review'
      };

      const result = await enhanceExistingPage(
        enhancementContent,
        enhancementRouting,
        reviewOptions
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');

      // Verify draft revision was created
      const pool = testDb.getPool();
      const pageResult = await pool.query(
        'SELECT current_published_revision_id, current_draft_revision_id FROM pages WHERE id = $1',
        [existingPageId]
      );

      // Published revision should remain unchanged
      expect(pageResult.rows[0].current_published_revision_id).toBe('00000000-0000-0000-0000-000000000002');
      // New draft revision should be created
      expect(pageResult.rows[0].current_draft_revision_id).toBe(result.revision_id);
    });

    it('should handle missing target page', async () => {
      const invalidRouting: RoutingResult = {
        ...enhancementRouting,
        target_page_id: '99999999-9999-9999-9999-999999999999'
      };

      const result = await enhanceExistingPage(
        enhancementContent,
        invalidRouting,
        { mode: 'automatic' }
      );

      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toBe('Target page not found');
    });

    it('should handle missing target_page_id', async () => {
      const invalidRouting: RoutingResult = {
        ...enhancementRouting,
        target_page_id: null
      };

      const result = await enhanceExistingPage(
        enhancementContent,
        invalidRouting,
        { mode: 'automatic' }
      );

      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toBe('No target page specified for enhancement');
    });

    it('should rollback on transaction failure during enhancement', async () => {
      claudeMock.mockContentMerging({
        scenario: 'content_enhancement',
        response: 'x'.repeat(1000000) // Extremely large content to cause issues
      });

      const result = await enhanceExistingPage(
        enhancementContent,
        enhancementRouting,
        { mode: 'automatic' }
      );

      // Should handle failure gracefully
      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');

      // Verify original page state is preserved
      const pool = testDb.getPool();
      const pageResult = await pool.query(
        'SELECT current_published_revision_id FROM pages WHERE id = $1',
        [existingPageId]
      );
      expect(pageResult.rows[0].current_published_revision_id).toBe('00000000-0000-0000-0000-000000000002');

      // Verify no extra revisions were created
      const revisionCount = await pool.query(
        'SELECT COUNT(*) FROM page_revisions WHERE page_id = $1',
        [existingPageId]
      );
      expect(parseInt(revisionCount.rows[0].count)).toBe(1);
    });

    it('should update embeddings after automatic enhancement', async () => {
      claudeMock.setupContentMerge(`## Enhanced Content

Enhanced content with new information for embedding updates.`);

      const result = await enhanceExistingPage(
        enhancementContent,
        enhancementRouting,
        { mode: 'automatic' }
      );

      expect(result.success).toBe(true);

      // Verify embeddings were updated for the page
      const pool = testDb.getPool();
      const embeddingResult = await pool.query(
        'SELECT * FROM page_embeddings WHERE page_id = $1',
        [existingPageId]
      );

      // Should have embedding record
      expect(embeddingResult.rows).toHaveLength(1);
      const embedding = embeddingResult.rows[0];
      expect(embedding.revision_id).toBe(result.revision_id);
      expect(embedding.embedding).toHaveLength(384);
    });
  });

  describe('integrateContent', () => {
    const sampleContent: ExtractedContent = {
      title: 'Integration Test',
      summary: 'Test content for integration routing.',
      content: 'This tests the main integration function...',
      topics: ['testing'],
      entities: {},
      confidence: 0.9
    };

    it('should route to createNewPage for new_page decision', async () => {
      claudeMock.setupContentGeneration('## Integration Test\n\nTest content for integration routing.');

      const routing: RoutingResult = {
        decision: 'new_page',
        target_page_id: null,
        target_section: null,
        reasoning: 'New unique content',
        suggested_slug: 'integration-test',
        suggested_title: 'Integration Test',
        confidence: 0.9,
        similar_pages: []
      };

      const result = await integrateContent(sampleContent, routing, { mode: 'automatic' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.slug).toBe('integration-test');
    });

    it('should route to enhanceExistingPage for update_page decision', async () => {
      // Setup existing page
      const pool = testDb.getPool();
      const existingPageId = '00000000-0000-0000-0000-000000000003';
      const revisionId = '00000000-0000-0000-0000-000000000004';

      // Create page first without revision references
      await pool.query(`
        INSERT INTO pages (id, slug, title, status)
        VALUES ($1, 'existing-integration', 'Existing Integration', 'published')
      `, [existingPageId]);

      // Create revision
      await pool.query(`
        INSERT INTO page_revisions (id, page_id, content_md, author_type)
        VALUES ($1, $2, '## Original Content\n\nOriginal information.', 'human')
      `, [revisionId, existingPageId]);

      // Update page with revision reference
      await pool.query(`
        UPDATE pages
        SET current_published_revision_id = $1
        WHERE id = $2
      `, [revisionId, existingPageId]);

      claudeMock.setupContentMerge(`## Original Content\n\nOriginal information.\n\n## Updated Section\n\nTest content for integration routing.`);

      const routing: RoutingResult = {
        decision: 'update_page',
        target_page_id: existingPageId,
        target_section: 'Updated Section',
        reasoning: 'Enhances existing content',
        suggested_slug: null,
        suggested_title: null,
        confidence: 0.85,
        similar_pages: []
      };

      const result = await integrateContent(sampleContent, routing, { mode: 'automatic' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('updated');
      expect(result.page_id).toBe(existingPageId);
    });

    it('should handle skip decision gracefully', async () => {
      const routing: RoutingResult = {
        decision: 'skip',
        target_page_id: null,
        target_section: null,
        reasoning: 'Content quality too low',
        suggested_slug: null,
        suggested_title: null,
        confidence: 0.3,
        similar_pages: []
      };

      const result = await integrateContent(sampleContent, routing, { mode: 'automatic' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('skipped');
      expect(result.error).toBe('Content quality too low');
    });

    it('should handle unknown routing decision', async () => {
      const routing: RoutingResult = {
        decision: 'unknown_decision' as any,
        target_page_id: null,
        target_section: null,
        reasoning: 'Unknown decision type',
        suggested_slug: null,
        suggested_title: null,
        confidence: 0.0,
        similar_pages: []
      };

      const result = await integrateContent(sampleContent, routing, { mode: 'automatic' });

      expect(result.success).toBe(false);
      expect(result.action).toBe('skipped');
      expect(result.error).toBe('Unknown routing decision: unknown_decision');
    });
  });

  describe('Database Transaction Safety', () => {
    it('should maintain referential integrity under concurrent operations', async () => {
      claudeMock.setupContentGeneration('## Concurrent Test\n\nConcurrent operation test content.');

      const content: ExtractedContent = {
        title: 'Concurrent Test',
        summary: 'Testing concurrent database operations',
        content: 'Content for concurrency testing',
        topics: ['concurrency'],
        entities: {},
        confidence: 0.9
      };

      // Execute multiple concurrent integrations
      const promises = Array.from({ length: 5 }, (_, i) => {
        const routing: RoutingResult = {
          decision: 'new_page',
          target_page_id: null,
          target_section: null,
          reasoning: 'Concurrent test page',
          suggested_slug: `concurrent-test-${i}`,
          suggested_title: `Concurrent Test ${i}`,
          confidence: 0.9,
          similar_pages: []
        };
        return createNewPage(content, routing, { mode: 'automatic' });
      });

      const results = await Promise.all(promises);

      // All operations should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.action).toBe('created');
      });

      // Verify database consistency
      const pool = testDb.getPool();
      const pageCount = await pool.query('SELECT COUNT(*) FROM pages');
      const revisionCount = await pool.query('SELECT COUNT(*) FROM page_revisions');
      const embeddingCount = await pool.query('SELECT COUNT(*) FROM page_embeddings');

      expect(parseInt(pageCount.rows[0].count)).toBe(5);
      expect(parseInt(revisionCount.rows[0].count)).toBe(5);
      expect(parseInt(embeddingCount.rows[0].count)).toBe(5);

      // Verify all foreign key relationships are intact
      const orphanedRevisions = await pool.query(`
        SELECT COUNT(*) FROM page_revisions pr
        LEFT JOIN pages p ON pr.page_id = p.id
        WHERE p.id IS NULL
      `);
      expect(parseInt(orphanedRevisions.rows[0].count)).toBe(0);

      const orphanedEmbeddings = await pool.query(`
        SELECT COUNT(*) FROM page_embeddings pe
        LEFT JOIN pages p ON pe.page_id = p.id
        WHERE p.id IS NULL
      `);
      expect(parseInt(orphanedEmbeddings.rows[0].count)).toBe(0);
    });

    it('should handle embedding generation failures gracefully', async () => {
      // Mock successful Claude response but we'll simulate embedding failure
      claudeMock.setupContentGeneration('## Test Content\n\nContent for embedding failure test.');

      // Create a spy to simulate embedding failure
      const originalConsoleWarn = console.warn;
      const warnSpy = vi.fn();
      console.warn = warnSpy;

      // Mock the embeddings service to throw an error by temporarily replacing it
      // Note: This test validates that embedding failures don't prevent page creation
      const originalStoreEmbedding = (await import('../../src/services/embeddings.js')).storeEmbedding;
      const embeddingsMock = vi.fn().mockRejectedValueOnce(new Error('Embedding service unavailable'));

      // Temporarily replace the function
      const embeddingsModule = await import('../../src/services/embeddings.js');
      (embeddingsModule as any).storeEmbedding = embeddingsMock;

      const content: ExtractedContent = {
        title: 'Embedding Failure Test',
        summary: 'Testing embedding failure handling',
        content: 'Test content',
        topics: [],
        entities: {},
        confidence: 0.9
      };

      const routing: RoutingResult = {
        decision: 'new_page',
        target_page_id: null,
        target_section: null,
        reasoning: 'Testing embedding failure',
        suggested_slug: 'embedding-failure-test',
        suggested_title: 'Embedding Failure Test',
        confidence: 0.9,
        similar_pages: []
      };

      const result = await createNewPage(content, routing, { mode: 'automatic' });

      // Page creation should still succeed
      expect(result.success).toBe(true);
      expect(result.action).toBe('created');

      // Warning should be logged
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to store embedding:',
        expect.any(Error)
      );

      // Page and revision should exist
      const pool = testDb.getPool();
      const pageExists = await pool.query('SELECT 1 FROM pages WHERE id = $1', [result.page_id]);
      expect(pageExists.rows).toHaveLength(1);

      const revisionExists = await pool.query('SELECT 1 FROM page_revisions WHERE id = $1', [result.revision_id]);
      expect(revisionExists.rows).toHaveLength(1);

      // But embedding should not exist
      const embeddingExists = await pool.query('SELECT 1 FROM page_embeddings WHERE page_id = $1', [result.page_id]);
      expect(embeddingExists.rows).toHaveLength(0);

      // Restore original functions
      console.warn = originalConsoleWarn;
      (embeddingsModule as any).storeEmbedding = originalStoreEmbedding;
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large content without memory issues', async () => {
      // Generate large content (50KB)
      const largeContent = 'Large content section. '.repeat(2500);

      claudeMock.setupContentGeneration(`## Large Content Test

${largeContent}

This tests large content processing capability.`);

      const content: ExtractedContent = {
        title: 'Large Content Test',
        summary: 'Testing large content handling',
        content: largeContent,
        topics: ['performance', 'large-content'],
        entities: {},
        confidence: 0.9
      };

      const routing: RoutingResult = {
        decision: 'new_page',
        target_page_id: null,
        target_section: null,
        reasoning: 'Large content test',
        suggested_slug: 'large-content-test',
        suggested_title: 'Large Content Test',
        confidence: 0.9,
        similar_pages: []
      };

      const startTime = Date.now();
      const result = await createNewPage(content, routing, { mode: 'automatic' });
      const endTime = Date.now();

      // Should complete successfully
      expect(result.success).toBe(true);

      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify content was stored correctly
      const pool = testDb.getPool();
      const revisionResult = await pool.query(
        'SELECT content_md FROM page_revisions WHERE id = $1',
        [result.revision_id]
      );
      expect(revisionResult.rows[0].content_md).toContain('Large content section.');

      // Verify embeddings were generated for large content
      const embeddingResult = await pool.query(
        'SELECT embedding FROM page_embeddings WHERE page_id = $1',
        [result.page_id]
      );
      expect(embeddingResult.rows).toHaveLength(1);
      expect(embeddingResult.rows[0].embedding).toHaveLength(384);
    });
  });
});