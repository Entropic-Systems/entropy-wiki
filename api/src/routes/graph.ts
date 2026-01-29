/**
 * Knowledge Graph API Routes
 *
 * Provides REST endpoints for the Content Relationship Graph feature:
 * - Related content discovery
 * - Prerequisites and learning paths
 * - Graph visualization data
 * - Knowledge gap analysis
 */

import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  getNodeNeighbors,
  getPrerequisitesForNode,
  findShortestPath,
  generateLearningPath,
  generateCategoryLearningPath,
  detectKnowledgeGaps,
  getGraphStats,
  detectPageRelationships,
  storeDetectedRelationships,
  clearAutoDetectedRelationships,
  getNodesByCategory,
  detectAllRelationships,
} from '../services/graph/index.js';

const router = Router();

/**
 * GET /api/pages/:slug/related
 * Get related pages for a given page
 */
router.get('/pages/:slug/related', async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      limit = 10,
      minStrength = 0.3,
      types
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit as string) || 10, 50);
    const parsedStrength = Math.max(parseFloat(minStrength as string) || 0.3, 0);
    const relationshipTypes = types ? (types as string).split(',') : undefined;

    const neighbors = await getNodeNeighbors(slug, {
      direction: 'both',
      minStrength: parsedStrength,
      relationshipTypes: relationshipTypes as any,
    });

    const related = neighbors
      .slice(0, parsedLimit)
      .map(neighbor => ({
        pageSlug: neighbor.node.pageSlug,
        title: neighbor.node.title,
        category: neighbor.node.category,
        nodeType: neighbor.node.nodeType,
        relationshipType: neighbor.edge.relationshipType,
        strength: neighbor.edge.strength,
        confidence: neighbor.edge.confidence,
        importanceScore: neighbor.node.importanceScore,
      }));

    res.json({
      success: true,
      pageSlug: slug,
      relatedPages: related,
      count: related.length,
    });
  } catch (error) {
    console.error('Error getting related pages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get related pages',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/pages/:slug/prerequisites
 * Get prerequisite chain for a page
 */
router.get('/pages/:slug/prerequisites', async (req, res) => {
  try {
    const { slug } = req.params;
    const {
      maxDepth = 5,
      minConfidence = 0.6
    } = req.query;

    const prerequisites = await getPrerequisitesForNode(slug, {
      maxDepth: parseInt(maxDepth as string) || 5,
      minConfidence: parseFloat(minConfidence as string) || 0.6,
    });

    res.json({
      success: true,
      pageSlug: slug,
      prerequisites: prerequisites.prerequisites.map(p => ({
        pageSlug: p.pageSlug,
        title: p.title,
        depth: p.depth,
        strength: p.strength,
        confidence: p.confidence,
        isRequired: p.isRequired,
      })),
      totalDepth: prerequisites.totalDepth,
      requiredPrerequisites: prerequisites.prerequisites
        .filter(p => p.isRequired)
        .map(p => p.pageSlug),
      optionalPrerequisites: prerequisites.optionalPrerequisites,
      missingPrerequisites: prerequisites.missingPrerequisites,
    });
  } catch (error) {
    console.error('Error getting prerequisites:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get prerequisites',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/paths/from/:source/to/:target
 * Find learning path between two pages
 */
router.get('/paths/from/:source/to/:target', async (req, res) => {
  try {
    const { source, target } = req.params;
    const {
      difficulty = 'intermediate',
      includeOptional = 'false',
      maxNodes = 20
    } = req.query;

    const path = await generateLearningPath(source, target, {
      difficulty: difficulty as any,
      includeOptional: includeOptional === 'true',
      maxNodes: parseInt(maxNodes as string) || 20,
    });

    if (!path) {
      return res.status(404).json({
        success: false,
        error: 'No path found',
        message: `No learning path found from ${source} to ${target}`,
      });
    }

    res.json({
      success: true,
      path: {
        id: path.id,
        title: path.title,
        description: path.description,
        difficulty: path.difficulty,
        estimatedMinutes: path.estimatedMinutes,
        nodeCount: path.nodes.length,
        nodes: path.nodes.map(node => ({
          pageSlug: node.pageSlug,
          title: node.title,
          nodeType: node.nodeType,
          order: node.order,
          estimatedMinutes: node.estimatedMinutes,
          isOptional: node.isOptional,
          prerequisites: node.prerequisites,
          reasoning: node.reasoning,
          difficultyScore: node.difficultyScore,
        })),
        alternatives: path.alternatives,
        completionCriteria: path.completionCriteria,
      },
    });
  } catch (error) {
    console.error('Error generating learning path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate learning path',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/category/:category
 * Get learning path for an entire category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { difficulty = 'intermediate' } = req.query;

    const path = await generateCategoryLearningPath(
      category,
      difficulty as any
    );

    if (!path) {
      return res.status(404).json({
        success: false,
        error: 'Category not found or no content',
        message: `No learning path found for category: ${category}`,
      });
    }

    res.json({
      success: true,
      category,
      path: {
        id: path.id,
        title: path.title,
        description: path.description,
        difficulty: path.difficulty,
        estimatedMinutes: path.estimatedMinutes,
        nodeCount: path.nodes.length,
        nodes: path.nodes,
        completionCriteria: path.completionCriteria,
      },
    });
  } catch (error) {
    console.error('Error getting category learning path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get category learning path',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/categories
 * Get all available categories with node counts
 */
router.get('/categories', async (req, res) => {
  try {
    // Get category statistics from the database
    const categoryStats = await getGraphStats();

    res.json({
      success: true,
      categories: categoryStats.clusters.map(cluster => ({
        category: cluster.clusterId,
        nodeCount: cluster.nodeCount,
      })),
      totalCategories: categoryStats.clusters.length,
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/gaps
 * Detect knowledge gaps in the graph
 */
router.get('/gaps', async (req, res) => {
  try {
    const { category, severity = 'all' } = req.query;

    const gaps = await detectKnowledgeGaps(category as string);

    // Filter by severity if specified
    const filteredGaps = severity === 'all'
      ? gaps
      : gaps.filter(gap => gap.severity === severity);

    res.json({
      success: true,
      gaps: filteredGaps.map(gap => ({
        gapType: gap.gapType,
        pageSlug: gap.pageSlug,
        description: gap.description,
        severity: gap.severity,
        suggestedAction: gap.suggestedAction,
        relatedPages: gap.relatedPages,
      })),
      totalGaps: filteredGaps.length,
      summary: {
        byType: gaps.reduce((acc, gap) => {
          acc[gap.gapType] = (acc[gap.gapType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        bySeverity: gaps.reduce((acc, gap) => {
          acc[gap.severity] = (acc[gap.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error) {
    console.error('Error detecting knowledge gaps:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect knowledge gaps',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/stats
 * Get overall graph statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getGraphStats();

    res.json({
      success: true,
      stats: {
        totalNodes: stats.totalNodes,
        totalEdges: stats.totalEdges,
        avgConnectionsPerNode: stats.avgConnectionsPerNode,
        strongestRelationships: stats.strongestRelationships.slice(0, 10).map(edge => ({
          sourceSlug: edge.sourceSlug,
          targetSlug: edge.targetSlug,
          relationshipType: edge.relationshipType,
          strength: edge.strength,
          confidence: edge.confidence,
        })),
        mostConnectedNodes: stats.mostConnectedNodes.slice(0, 10).map(node => ({
          pageSlug: node.pageSlug,
          title: node.title,
          category: node.category,
          connectionCount: node.connectionCount,
          importanceScore: node.importanceScore,
        })),
        clusters: stats.clusters.slice(0, 20),
      },
    });
  } catch (error) {
    console.error('Error getting graph stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get graph statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// ADMIN ENDPOINTS (require authentication)
// ============================================================================

/**
 * POST /api/graph/rebuild
 * Rebuild the entire knowledge graph from scratch
 */
router.post('/rebuild', authenticateAdmin, async (req, res) => {
  try {
    const { clearExisting = true } = req.body;

    let cleared = 0;
    if (clearExisting) {
      cleared = await clearAutoDetectedRelationships();
    }

    // Detect all relationships
    const relationships = await detectAllRelationships({
      batchSize: 5,
      onProgress: (processed, total) => {
        console.log(`Graph rebuild progress: ${processed}/${total} pages processed`);
      },
    });

    // Store relationships
    const result = await storeDetectedRelationships(relationships);

    res.json({
      success: true,
      message: 'Knowledge graph rebuilt successfully',
      stats: {
        relationshipsCleared: cleared,
        relationshipsDetected: relationships.length,
        relationshipsStored: result.stored,
        errors: result.errors.length,
      },
      errors: result.errors.slice(0, 10), // Show first 10 errors
    });
  } catch (error) {
    console.error('Error rebuilding graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rebuild graph',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/graph/detect/:slug
 * Detect relationships for a specific page
 */
router.post('/detect/:slug', authenticateAdmin, async (req, res) => {
  try {
    const { slug } = req.params;
    const { limit = 20 } = req.body;

    const relationships = await detectPageRelationships(slug, {
      limit: parseInt(limit) || 20,
    });

    const result = await storeDetectedRelationships(relationships);

    res.json({
      success: true,
      pageSlug: slug,
      relationshipsDetected: relationships.length,
      relationshipsStored: result.stored,
      errors: result.errors,
      relationships: relationships.map(r => ({
        targetSlug: r.targetSlug,
        relationshipType: r.relationshipType,
        strength: r.strength,
        confidence: r.confidence,
        detectedBy: r.detectedBy,
      })),
    });
  } catch (error) {
    console.error('Error detecting page relationships:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect page relationships',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/graph/nodes
 * Get all graph nodes with optional filtering
 */
router.get('/nodes', authenticateAdmin, async (req, res) => {
  try {
    const { category, nodeType, limit = 100 } = req.query;

    let nodes;
    if (category) {
      nodes = await getNodesByCategory(category as string);
    } else {
      // Get nodes with basic filtering - this could be enhanced
      const stats = await getGraphStats();
      nodes = stats.mostConnectedNodes;
    }

    // Apply additional filtering
    if (nodeType) {
      nodes = nodes.filter(node => node.nodeType === nodeType);
    }

    const limitedNodes = nodes.slice(0, parseInt(limit as string) || 100);

    res.json({
      success: true,
      nodes: limitedNodes.map(node => ({
        id: node.id,
        pageSlug: node.pageSlug,
        title: node.title,
        category: node.category,
        nodeType: node.nodeType,
        importanceScore: node.importanceScore,
        connectionCount: node.connectionCount,
        position: node.position,
        clusterId: node.clusterId,
        difficultyScore: node.difficultyScore,
        updatedAt: node.updatedAt,
      })),
      count: limitedNodes.length,
      totalAvailable: nodes.length,
    });
  } catch (error) {
    console.error('Error getting graph nodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get graph nodes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;