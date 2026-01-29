/**
 * Graph Store Service
 *
 * Manages the knowledge graph storage in PostgreSQL:
 * - Stores nodes and edges efficiently
 * - Provides graph traversal queries
 * - Handles graph statistics and metrics
 * - Maintains referential integrity
 */

import { query } from '../../db/client.js';
import type { DetectedRelationship, RelationshipType } from './relationship-detector.js';

export interface GraphNode {
  id: string;
  pageSlug: string;
  title: string;
  category: string;
  nodeType: 'concept' | 'tutorial' | 'reference' | 'example' | 'tool';
  importanceScore: number;
  connectionCount: number;
  position: { x: number; y: number; z: number };
  clusterId?: string;
  difficultyScore?: number;
  updatedAt: Date;
}

export interface GraphEdge {
  id: string;
  sourceSlug: string;
  targetSlug: string;
  relationshipType: RelationshipType;
  strength: number;
  bidirectional: boolean;
  autoDetected: boolean;
  confidence: number;
  createdAt: Date;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  avgConnectionsPerNode: number;
  strongestRelationships: GraphEdge[];
  mostConnectedNodes: GraphNode[];
  clusters: { clusterId: string; nodeCount: number }[];
}

export interface TraversalOptions {
  maxDepth?: number;
  relationshipTypes?: RelationshipType[];
  minStrength?: number;
  direction?: 'incoming' | 'outgoing' | 'both';
}

/**
 * Create or update a graph node
 */
export async function upsertGraphNode(
  pageSlug: string,
  options?: {
    title?: string;
    category?: string;
    nodeType?: GraphNode['nodeType'];
    importanceScore?: number;
    position?: { x: number; y: number; z: number };
    clusterId?: string;
    difficultyScore?: number;
  }
): Promise<GraphNode> {
  const {
    title = 'Unknown',
    category = 'general',
    nodeType = 'concept',
    importanceScore = 0.5,
    position = { x: 0, y: 0, z: 0 },
    clusterId,
    difficultyScore,
  } = options ?? {};

  const result = await query<{
    id: string;
    page_slug: string;
    title: string;
    category: string;
    node_type: string;
    importance_score: number;
    connection_count: number;
    position_x: number;
    position_y: number;
    position_z: number;
    cluster_id: string;
    difficulty_score: number;
    updated_at: Date;
  }>(`
    INSERT INTO knowledge_graph_nodes (
      page_slug, title, category, node_type,
      importance_score, position_x, position_y, position_z,
      cluster_id, difficulty_score
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (page_slug) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      node_type = EXCLUDED.node_type,
      importance_score = EXCLUDED.importance_score,
      position_x = EXCLUDED.position_x,
      position_y = EXCLUDED.position_y,
      position_z = EXCLUDED.position_z,
      cluster_id = EXCLUDED.cluster_id,
      difficulty_score = EXCLUDED.difficulty_score,
      updated_at = NOW()
    RETURNING
      id, page_slug, title, category, node_type,
      importance_score, connection_count,
      position_x, position_y, position_z,
      cluster_id, difficulty_score, updated_at
  `, [pageSlug, title, category, nodeType, importanceScore, position.x, position.y, position.z, clusterId, difficultyScore]);

  const row = result.rows[0];
  return {
    id: row.id,
    pageSlug: row.page_slug,
    title: row.title,
    category: row.category,
    nodeType: row.node_type as GraphNode['nodeType'],
    importanceScore: row.importance_score,
    connectionCount: row.connection_count,
    position: {
      x: row.position_x,
      y: row.position_y,
      z: row.position_z
    },
    clusterId: row.cluster_id,
    difficultyScore: row.difficulty_score,
    updatedAt: row.updated_at,
  };
}

/**
 * Create or update a graph edge
 */
export async function upsertGraphEdge(
  sourceSlug: string,
  targetSlug: string,
  relationshipType: RelationshipType,
  options?: {
    strength?: number;
    bidirectional?: boolean;
    autoDetected?: boolean;
    confidence?: number;
  }
): Promise<GraphEdge> {
  const {
    strength = 0.5,
    bidirectional = false,
    autoDetected = true,
    confidence = 0.7,
  } = options ?? {};

  const result = await query<{
    id: string;
    source_slug: string;
    target_slug: string;
    relationship_type: string;
    strength: number;
    bidirectional: boolean;
    auto_detected: boolean;
    confidence: number;
    created_at: Date;
  }>(`
    INSERT INTO knowledge_graph_edges (
      source_slug, target_slug, relationship_type,
      strength, bidirectional, auto_detected, confidence
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (source_slug, target_slug, relationship_type) DO UPDATE SET
      strength = EXCLUDED.strength,
      bidirectional = EXCLUDED.bidirectional,
      auto_detected = EXCLUDED.auto_detected,
      confidence = EXCLUDED.confidence
    RETURNING
      id, source_slug, target_slug, relationship_type,
      strength, bidirectional, auto_detected, confidence, created_at
  `, [sourceSlug, targetSlug, relationshipType, strength, bidirectional, autoDetected, confidence]);

  const row = result.rows[0];
  return {
    id: row.id,
    sourceSlug: row.source_slug,
    targetSlug: row.target_slug,
    relationshipType: row.relationship_type as RelationshipType,
    strength: row.strength,
    bidirectional: row.bidirectional,
    autoDetected: row.auto_detected,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

/**
 * Store multiple detected relationships efficiently
 */
export async function storeDetectedRelationships(
  relationships: DetectedRelationship[]
): Promise<{ stored: number; errors: string[] }> {
  let stored = 0;
  const errors: string[] = [];

  try {
    // Start transaction
    await query('BEGIN');

    for (const rel of relationships) {
      try {
        // Ensure both nodes exist
        await upsertGraphNode(rel.sourceSlug);
        await upsertGraphNode(rel.targetSlug);

        // Store the edge
        await upsertGraphEdge(
          rel.sourceSlug,
          rel.targetSlug,
          rel.relationshipType,
          {
            strength: rel.strength,
            confidence: rel.confidence,
            autoDetected: true,
          }
        );

        stored++;
      } catch (error) {
        const errorMsg = `Failed to store relationship ${rel.sourceSlug} -> ${rel.targetSlug}: ${error}`;
        console.warn(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Update connection counts
    await updateConnectionCounts();

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    errors.push(`Transaction failed: ${error}`);
  }

  return { stored, errors };
}

/**
 * Get all neighbors of a node with optional filtering
 */
export async function getNodeNeighbors(
  pageSlug: string,
  options?: TraversalOptions
): Promise<{ node: GraphNode; edge: GraphEdge; distance: number }[]> {
  const {
    relationshipTypes,
    minStrength = 0,
    direction = 'both',
  } = options ?? {};

  let whereClause = '';
  let params: any[] = [pageSlug, minStrength];

  if (relationshipTypes && relationshipTypes.length > 0) {
    params.push(relationshipTypes);
    whereClause += ` AND e.relationship_type = ANY($${params.length})`;
  }

  let directionClause = '';
  if (direction === 'outgoing') {
    directionClause = 'AND e.source_slug = $1';
  } else if (direction === 'incoming') {
    directionClause = 'AND e.target_slug = $1';
  } else {
    // both directions
    directionClause = 'AND (e.source_slug = $1 OR e.target_slug = $1)';
  }

  const result = await query<{
    edge_id: string;
    source_slug: string;
    target_slug: string;
    relationship_type: RelationshipType;
    strength: number;
    bidirectional: boolean;
    auto_detected: boolean;
    confidence: number;
    edge_created_at: Date;
    node_id: string;
    page_slug: string;
    title: string;
    category: string;
    node_type: GraphNode['nodeType'];
    importance_score: number;
    connection_count: number;
    position_x: number;
    position_y: number;
    position_z: number;
    cluster_id: string;
    difficulty_score: number;
    updated_at: Date;
  }>(`
    SELECT
      e.id as edge_id, e.source_slug, e.target_slug, e.relationship_type,
      e.strength, e.bidirectional, e.auto_detected, e.confidence,
      e.created_at as edge_created_at,
      n.id as node_id, n.page_slug, n.title, n.category, n.node_type,
      n.importance_score, n.connection_count,
      n.position_x, n.position_y, n.position_z,
      n.cluster_id, n.difficulty_score, n.updated_at
    FROM knowledge_graph_edges e
    JOIN knowledge_graph_nodes n ON (
      CASE
        WHEN e.source_slug = $1 THEN n.page_slug = e.target_slug
        ELSE n.page_slug = e.source_slug
      END
    )
    WHERE e.strength >= $2
      ${directionClause}
      ${whereClause}
    ORDER BY e.strength DESC, e.confidence DESC
  `, params);

  return result.rows.map(row => ({
    node: {
      id: row.node_id,
      pageSlug: row.page_slug,
      title: row.title,
      category: row.category,
      nodeType: row.node_type,
      importanceScore: row.importance_score,
      connectionCount: row.connection_count,
      position: { x: row.position_x, y: row.position_y, z: row.position_z },
      clusterId: row.cluster_id,
      difficultyScore: row.difficulty_score,
      updatedAt: row.updated_at,
    },
    edge: {
      id: row.edge_id,
      sourceSlug: row.source_slug,
      targetSlug: row.target_slug,
      relationshipType: row.relationship_type,
      strength: row.strength,
      bidirectional: row.bidirectional,
      autoDetected: row.auto_detected,
      confidence: row.confidence,
      createdAt: row.edge_created_at,
    },
    distance: 1, // Direct neighbor
  }));
}

/**
 * Find shortest path between two nodes
 */
export async function findShortestPath(
  sourceSlug: string,
  targetSlug: string,
  options?: TraversalOptions
): Promise<{ path: string[]; distance: number; edges: GraphEdge[] } | null> {
  const { maxDepth = 6, minStrength = 0.3 } = options ?? {};

  // Use recursive CTE for path finding
  const result = await query<{
    path: string[];
    distance: number;
    edges: string[];
  }>(`
    WITH RECURSIVE path_search AS (
      -- Base case: start from source
      SELECT
        ARRAY[source_slug] as path,
        1 as distance,
        ARRAY[id::text] as edges,
        target_slug as current_slug
      FROM knowledge_graph_edges
      WHERE source_slug = $1 AND strength >= $3

      UNION ALL

      -- Recursive case: extend path
      SELECT
        ps.path || e.target_slug,
        ps.distance + 1,
        ps.edges || e.id::text,
        e.target_slug
      FROM path_search ps
      JOIN knowledge_graph_edges e ON e.source_slug = ps.current_slug
      WHERE
        ps.distance < $4
        AND e.strength >= $3
        AND NOT (e.target_slug = ANY(ps.path)) -- Prevent cycles
    )
    SELECT path, distance, edges
    FROM path_search
    WHERE current_slug = $2
    ORDER BY distance, array_length(path, 1)
    LIMIT 1
  `, [sourceSlug, targetSlug, minStrength, maxDepth]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Get edge details
  const edgeDetails = await query<GraphEdge>(`
    SELECT id, source_slug, target_slug, relationship_type, strength,
           bidirectional, auto_detected, confidence, created_at
    FROM knowledge_graph_edges
    WHERE id = ANY($1::uuid[])
    ORDER BY created_at
  `, [row.edges]);

  return {
    path: [sourceSlug, ...row.path.slice(1)],
    distance: row.distance,
    edges: edgeDetails.rows,
  };
}

/**
 * Get nodes by category
 */
export async function getNodesByCategory(category: string): Promise<GraphNode[]> {
  const result = await query<{
    id: string;
    page_slug: string;
    title: string;
    category: string;
    node_type: string;
    importance_score: number;
    connection_count: number;
    position_x: number;
    position_y: number;
    position_z: number;
    cluster_id: string;
    difficulty_score: number;
    updated_at: Date;
  }>(`
    SELECT
      id, page_slug, title, category, node_type,
      importance_score, connection_count,
      position_x, position_y, position_z,
      cluster_id, difficulty_score, updated_at
    FROM knowledge_graph_nodes
    WHERE category = $1
    ORDER BY importance_score DESC, connection_count DESC
  `, [category]);

  return result.rows.map(row => ({
    id: row.id,
    pageSlug: row.page_slug,
    title: row.title,
    category: row.category,
    nodeType: row.node_type as GraphNode['nodeType'],
    importanceScore: row.importance_score,
    connectionCount: row.connection_count,
    position: {
      x: row.position_x,
      y: row.position_y,
      z: row.position_z
    },
    clusterId: row.cluster_id,
    difficultyScore: row.difficulty_score,
    updatedAt: row.updated_at,
  }));
}

/**
 * Update connection counts for all nodes
 */
export async function updateConnectionCounts(): Promise<void> {
  await query(`
    UPDATE knowledge_graph_nodes
    SET connection_count = (
      SELECT COUNT(*)
      FROM knowledge_graph_edges
      WHERE source_slug = knowledge_graph_nodes.page_slug
         OR target_slug = knowledge_graph_nodes.page_slug
    )
  `);
}

/**
 * Get graph statistics
 */
export async function getGraphStats(): Promise<GraphStats> {
  // Basic counts
  const countsResult = await query<{
    total_nodes: number;
    total_edges: number;
    avg_connections: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_graph_nodes) as total_nodes,
      (SELECT COUNT(*) FROM knowledge_graph_edges) as total_edges,
      (SELECT AVG(connection_count) FROM knowledge_graph_nodes) as avg_connections
  `);

  const counts = countsResult.rows[0];

  // Strongest relationships
  const strongestResult = await query<GraphEdge>(`
    SELECT id, source_slug, target_slug, relationship_type,
           strength, bidirectional, auto_detected, confidence, created_at
    FROM knowledge_graph_edges
    ORDER BY strength DESC, confidence DESC
    LIMIT 10
  `);

  // Most connected nodes
  const connectedResult = await query<{
    id: string;
    page_slug: string;
    title: string;
    category: string;
    node_type: string;
    importance_score: number;
    connection_count: number;
    position_x: number;
    position_y: number;
    position_z: number;
    cluster_id: string;
    difficulty_score: number;
    updated_at: Date;
  }>(`
    SELECT
      id, page_slug, title, category, node_type,
      importance_score, connection_count,
      0 as position_x, 0 as position_y, 0 as position_z,
      cluster_id, difficulty_score, updated_at
    FROM knowledge_graph_nodes
    ORDER BY connection_count DESC, importance_score DESC
    LIMIT 10
  `);

  // Clusters
  const clustersResult = await query<{ cluster_id: string; node_count: number }>(`
    SELECT cluster_id, COUNT(*) as node_count
    FROM knowledge_graph_nodes
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
    ORDER BY node_count DESC
  `);

  return {
    totalNodes: counts.total_nodes,
    totalEdges: counts.total_edges,
    avgConnectionsPerNode: Math.round(counts.avg_connections * 100) / 100,
    strongestRelationships: strongestResult.rows,
    mostConnectedNodes: connectedResult.rows.map(row => ({
      id: row.id,
      pageSlug: row.page_slug,
      title: row.title,
      category: row.category,
      nodeType: row.node_type as GraphNode['nodeType'],
      importanceScore: row.importance_score,
      connectionCount: row.connection_count,
      position: { x: row.position_x, y: row.position_y, z: row.position_z },
      clusterId: row.cluster_id,
      difficultyScore: row.difficulty_score,
      updatedAt: row.updated_at,
    })),
    clusters: clustersResult.rows.map(row => ({
      clusterId: row.cluster_id,
      nodeCount: row.node_count,
    })),
  };
}

/**
 * Delete all auto-detected relationships (for rebuilding)
 */
export async function clearAutoDetectedRelationships(): Promise<number> {
  const result = await query(`
    DELETE FROM knowledge_graph_edges
    WHERE auto_detected = true
  `);

  // Update connection counts after deletion
  await updateConnectionCounts();

  return result.rowCount || 0;
}