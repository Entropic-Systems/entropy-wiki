/**
 * Graph Services Test
 * Basic validation of the Content Relationship Graph functionality
 *
 * Note: These tests require a fully configured test database with all migrations.
 * In CI environments, these tests will be skipped.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestDatabase } from '../utils/test-database.js';
import {
  upsertGraphNode,
  upsertGraphEdge,
  getNodeNeighbors,
  getGraphStats,
  detectPageRelationships,
  storeDetectedRelationships,
} from '../../src/services/graph/index.js';

// Skip these integration tests in CI - they require TestDatabase with full schema
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const describeIntegration = isCI ? describe.skip : describe;

describeIntegration('Content Relationship Graph', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    console.log('Setting up test database for graph tests...');
    testDb = await TestDatabase.create('graph-test');
    console.log('Graph test database setup complete');
  }, 60000);

  afterEach(async () => {
    await testDb.cleanup();
  }, 30000);

  describe('Graph Store', () => {
    it('should create and retrieve graph nodes', async () => {
      const node = await upsertGraphNode('test-page-1', {
        title: 'Test Page 1',
        category: 'beads',
        nodeType: 'concept',
        importanceScore: 0.8,
        position: { x: 1, y: 2, z: 3 },
        difficultyScore: 3,
      });

      expect(node).toMatchObject({
        pageSlug: 'test-page-1',
        title: 'Test Page 1',
        category: 'beads',
        nodeType: 'concept',
        importanceScore: 0.8,
        position: { x: 1, y: 2, z: 3 },
        difficultyScore: 3,
      });
      expect(node.id).toBeDefined();
      expect(node.updatedAt).toBeInstanceOf(Date);
    });

    it('should create and retrieve graph edges', async () => {
      // Create two nodes first
      await upsertGraphNode('page-a');
      await upsertGraphNode('page-b');

      const edge = await upsertGraphEdge(
        'page-a',
        'page-b',
        'related',
        {
          strength: 0.7,
          confidence: 0.85,
          autoDetected: true,
        }
      );

      expect(edge).toMatchObject({
        sourceSlug: 'page-a',
        targetSlug: 'page-b',
        relationshipType: 'related',
        strength: 0.7,
        confidence: 0.85,
        autoDetected: true,
      });
      expect(edge.id).toBeDefined();
      expect(edge.createdAt).toBeInstanceOf(Date);
    });

    it('should find node neighbors', async () => {
      // Create nodes and edges
      await upsertGraphNode('central-node', { title: 'Central Node' });
      await upsertGraphNode('related-1', { title: 'Related 1' });
      await upsertGraphNode('related-2', { title: 'Related 2' });

      await upsertGraphEdge('central-node', 'related-1', 'related', { strength: 0.8 });
      await upsertGraphEdge('central-node', 'related-2', 'prerequisite', { strength: 0.9 });

      const neighbors = await getNodeNeighbors('central-node');

      expect(neighbors).toHaveLength(2);
      expect(neighbors.map(n => n.node.pageSlug)).toContain('related-1');
      expect(neighbors.map(n => n.node.pageSlug)).toContain('related-2');
      expect(neighbors.map(n => n.edge.relationshipType)).toContain('related');
      expect(neighbors.map(n => n.edge.relationshipType)).toContain('prerequisite');
    });

    it('should get graph statistics', async () => {
      // Create test data
      await upsertGraphNode('node-1', { title: 'Node 1', category: 'test' });
      await upsertGraphNode('node-2', { title: 'Node 2', category: 'test' });
      await upsertGraphNode('node-3', { title: 'Node 3', category: 'test' });

      await upsertGraphEdge('node-1', 'node-2', 'related', { strength: 0.8 });
      await upsertGraphEdge('node-2', 'node-3', 'extends', { strength: 0.9 });

      const stats = await getGraphStats();

      expect(stats.totalNodes).toBeGreaterThan(0);
      expect(stats.totalEdges).toBeGreaterThan(0);
      expect(stats.avgConnectionsPerNode).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(stats.strongestRelationships)).toBe(true);
      expect(Array.isArray(stats.mostConnectedNodes)).toBe(true);
    });
  });

  describe('Relationship Detection', () => {
    it('should handle relationship detection for non-existent pages gracefully', async () => {
      const relationships = await detectPageRelationships('non-existent-page');
      expect(relationships).toEqual([]);
    });

    it('should store detected relationships', async () => {
      // Create mock relationship data
      const mockRelationships = [
        {
          sourceSlug: 'source-page',
          targetSlug: 'target-page',
          relationshipType: 'related' as const,
          strength: 0.7,
          confidence: 0.8,
          detectedBy: 'test',
          evidence: {
            semanticSimilarity: 0.7,
          },
        },
      ];

      const result = await storeDetectedRelationships(mockRelationships);

      expect(result.stored).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify the nodes were created
      const neighbors = await getNodeNeighbors('source-page');
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].node.pageSlug).toBe('target-page');
    });
  });

  describe('Database Schema Validation', () => {
    it('should have required graph tables', async () => {
      const pool = testDb.getPool();

      // Check knowledge_graph_nodes table exists
      const nodesTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'knowledge_graph_nodes'
        );
      `);
      expect(nodesTableCheck.rows[0].exists).toBe(true);

      // Check knowledge_graph_edges table exists
      const edgesTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'knowledge_graph_edges'
        );
      `);
      expect(edgesTableCheck.rows[0].exists).toBe(true);
    });

    it('should have correct node table structure', async () => {
      const pool = testDb.getPool();

      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'knowledge_graph_nodes'
        ORDER BY column_name;
      `);

      const columnNames = columns.rows.map(row => row.column_name);

      // Verify key columns exist
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('page_slug');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('category');
      expect(columnNames).toContain('node_type');
      expect(columnNames).toContain('importance_score');
      expect(columnNames).toContain('connection_count');
      expect(columnNames).toContain('difficulty_score');
    });

    it('should have correct edge table structure', async () => {
      const pool = testDb.getPool();

      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'knowledge_graph_edges'
        ORDER BY column_name;
      `);

      const columnNames = columns.rows.map(row => row.column_name);

      // Verify key columns exist
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('source_slug');
      expect(columnNames).toContain('target_slug');
      expect(columnNames).toContain('relationship_type');
      expect(columnNames).toContain('strength');
      expect(columnNames).toContain('confidence');
      expect(columnNames).toContain('auto_detected');
    });
  });
});