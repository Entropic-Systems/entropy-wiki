/**
 * Path Generator Service
 *
 * Generates learning paths and prerequisite chains from the knowledge graph:
 * - Computes optimal learning sequences
 * - Resolves prerequisite dependencies
 * - Suggests alternative paths
 * - Identifies knowledge gaps
 */

import { query } from '../../db/client.js';
import {
  getNodeNeighbors,
  findShortestPath,
  getNodesByCategory,
  type GraphNode,
  type GraphEdge,
  type TraversalOptions,
} from './graph-store.js';

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimatedMinutes: number;
  nodes: LearningPathNode[];
  alternatives: AlternativePath[];
  completionCriteria: string[];
}

export interface LearningPathNode {
  pageSlug: string;
  title: string;
  nodeType: GraphNode['nodeType'];
  order: number;
  estimatedMinutes: number;
  isOptional: boolean;
  prerequisites: string[];
  reasoning: string;
  difficultyScore?: number;
}

export interface AlternativePath {
  reason: string;
  nodes: string[];
  description: string;
  estimatedMinutes: number;
}

export interface PrerequisiteChain {
  targetSlug: string;
  prerequisites: PrerequisiteNode[];
  totalDepth: number;
  missingPrerequisites: string[];
  optionalPrerequisites: string[];
}

export interface PrerequisiteNode {
  pageSlug: string;
  title: string;
  depth: number;
  strength: number;
  confidence: number;
  isRequired: boolean;
}

export interface KnowledgeGap {
  gapType: 'missing_prerequisite' | 'weak_connection' | 'isolated_concept' | 'missing_follow_up';
  pageSlug: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestedAction: string;
  relatedPages: string[];
}

/**
 * Generate a learning path from one topic to another
 */
export async function generateLearningPath(
  startSlug: string,
  endSlug: string,
  options?: {
    difficulty?: LearningPath['difficulty'];
    includeOptional?: boolean;
    maxNodes?: number;
  }
): Promise<LearningPath | null> {
  const {
    difficulty = 'intermediate',
    includeOptional = false,
    maxNodes = 20,
  } = options ?? {};

  try {
    // Find the shortest path as a baseline
    const shortestPath = await findShortestPath(startSlug, endSlug, {
      maxDepth: 8,
      minStrength: 0.4,
    });

    if (!shortestPath) {
      return null;
    }

    // Get detailed information for each node in the path
    const pathNodes: LearningPathNode[] = [];
    let totalMinutes = 0;

    for (let i = 0; i < shortestPath.path.length; i++) {
      const slug = shortestPath.path[i];

      // Get node details
      const nodeResult = await query<{
        title: string;
        node_type: GraphNode['nodeType'];
        difficulty_score: number;
      }>(`
        SELECT n.title, n.node_type, n.difficulty_score
        FROM knowledge_graph_nodes n
        WHERE n.page_slug = $1
      `, [slug]);

      if (nodeResult.rows.length === 0) continue;

      const nodeData = nodeResult.rows[0];

      // Get prerequisites for this node
      const prerequisites = await getPrerequisitesForNode(slug);
      const prereqSlugs = prerequisites.prerequisites.map(p => p.pageSlug);

      // Estimate time based on node type and difficulty
      const estimatedMinutes = estimateNodeTime(nodeData.node_type, nodeData.difficulty_score);

      // Determine reasoning for inclusion
      let reasoning = '';
      if (i === 0) {
        reasoning = 'Starting point of the learning journey';
      } else if (i === shortestPath.path.length - 1) {
        reasoning = 'Target destination of the learning journey';
      } else {
        reasoning = `Essential step in the path from ${startSlug} to ${endSlug}`;
      }

      pathNodes.push({
        pageSlug: slug,
        title: nodeData.title,
        nodeType: nodeData.node_type,
        order: i + 1,
        estimatedMinutes,
        isOptional: false,
        prerequisites: prereqSlugs,
        reasoning,
        difficultyScore: nodeData.difficulty_score,
      });

      totalMinutes += estimatedMinutes;
    }

    // Add optional related content if requested
    if (includeOptional && pathNodes.length < maxNodes) {
      const optionalNodes = await findOptionalNodes(shortestPath.path, difficulty, maxNodes - pathNodes.length);
      pathNodes.push(...optionalNodes);
      totalMinutes += optionalNodes.reduce((sum, node) => sum + node.estimatedMinutes, 0);
    }

    // Generate alternative paths
    const alternatives = await findAlternativePaths(startSlug, endSlug, shortestPath.path);

    return {
      id: generatePathId(startSlug, endSlug),
      title: `Learning Path: ${pathNodes[0]?.title} → ${pathNodes[pathNodes.length - 1]?.title}`,
      description: `A structured learning path from ${startSlug} to ${endSlug} with ${pathNodes.length} steps`,
      difficulty,
      estimatedMinutes: totalMinutes,
      nodes: pathNodes,
      alternatives,
      completionCriteria: generateCompletionCriteria(pathNodes),
    };
  } catch (error) {
    console.error('Error generating learning path:', error);
    return null;
  }
}

/**
 * Get prerequisite chain for a specific topic
 */
export async function getPrerequisitesForNode(
  pageSlug: string,
  options?: {
    maxDepth?: number;
    minConfidence?: number;
  }
): Promise<PrerequisiteChain> {
  const { maxDepth = 5, minConfidence = 0.6 } = options ?? {};

  const prerequisites: PrerequisiteNode[] = [];
  const visited = new Set<string>();
  const queue: { slug: string; depth: number }[] = [{ slug: pageSlug, depth: 0 }];

  try {
    while (queue.length > 0) {
      const { slug, depth } = queue.shift()!;

      if (depth >= maxDepth || visited.has(slug)) {
        continue;
      }

      visited.add(slug);

      // Find prerequisite relationships
      const prereqNeighbors = await getNodeNeighbors(slug, {
        direction: 'incoming',
        relationshipTypes: ['prerequisite'],
        minStrength: 0.4,
      });

      for (const neighbor of prereqNeighbors) {
        if (neighbor.edge.confidence >= minConfidence && !visited.has(neighbor.node.pageSlug)) {
          prerequisites.push({
            pageSlug: neighbor.node.pageSlug,
            title: neighbor.node.title,
            depth: depth + 1,
            strength: neighbor.edge.strength,
            confidence: neighbor.edge.confidence,
            isRequired: neighbor.edge.strength >= 0.7 && neighbor.edge.confidence >= 0.8,
          });

          // Add to queue for further exploration
          queue.push({ slug: neighbor.node.pageSlug, depth: depth + 1 });
        }
      }
    }

    // Separate required and optional prerequisites
    const required = prerequisites.filter(p => p.isRequired).map(p => p.pageSlug);
    const optional = prerequisites.filter(p => !p.isRequired).map(p => p.pageSlug);

    // Find missing prerequisites (referenced but not in our graph)
    const missing = await findMissingPrerequisites(pageSlug, required);

    return {
      targetSlug: pageSlug,
      prerequisites,
      totalDepth: Math.max(...prerequisites.map(p => p.depth), 0),
      missingPrerequisites: missing,
      optionalPrerequisites: optional,
    };
  } catch (error) {
    console.error('Error getting prerequisites:', error);
    return {
      targetSlug: pageSlug,
      prerequisites: [],
      totalDepth: 0,
      missingPrerequisites: [],
      optionalPrerequisites: [],
    };
  }
}

/**
 * Generate a comprehensive learning path for a category
 */
export async function generateCategoryLearningPath(
  category: string,
  difficulty: LearningPath['difficulty'] = 'intermediate'
): Promise<LearningPath | null> {
  try {
    const categoryNodes = await getNodesByCategory(category);

    if (categoryNodes.length === 0) {
      return null;
    }

    // Sort nodes by difficulty and importance
    const sortedNodes = categoryNodes
      .filter(node => node.difficultyScore !== null)
      .sort((a, b) => {
        const diffScore = (a.difficultyScore || 3) - (b.difficultyScore || 3);
        if (diffScore !== 0) return diffScore;
        return b.importanceScore - a.importanceScore;
      });

    // Build learning sequence based on difficulty progression
    const pathNodes: LearningPathNode[] = [];
    let totalMinutes = 0;

    for (let i = 0; i < Math.min(sortedNodes.length, 15); i++) {
      const node = sortedNodes[i];
      const estimatedMinutes = estimateNodeTime(node.nodeType, node.difficultyScore || 3);

      // Get prerequisites for ordering
      const prereqs = await getPrerequisitesForNode(node.pageSlug, { maxDepth: 2 });

      pathNodes.push({
        pageSlug: node.pageSlug,
        title: node.title,
        nodeType: node.nodeType,
        order: i + 1,
        estimatedMinutes,
        isOptional: i > 10, // First 10 are required, rest optional
        prerequisites: prereqs.prerequisites.map(p => p.pageSlug),
        reasoning: i < 3 ? 'Foundational concept' :
                  i < 8 ? 'Core knowledge' : 'Advanced topic',
        difficultyScore: node.difficultyScore,
      });

      totalMinutes += estimatedMinutes;
    }

    return {
      id: generatePathId('category', category),
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} Learning Path`,
      description: `Complete learning path for the ${category} category`,
      difficulty,
      estimatedMinutes: totalMinutes,
      nodes: pathNodes,
      alternatives: [],
      completionCriteria: generateCompletionCriteria(pathNodes),
    };
  } catch (error) {
    console.error('Error generating category learning path:', error);
    return null;
  }
}

/**
 * Detect knowledge gaps in the graph
 */
export async function detectKnowledgeGaps(
  category?: string
): Promise<KnowledgeGap[]> {
  const gaps: KnowledgeGap[] = [];

  try {
    // 1. Find isolated nodes (no connections)
    const isolatedResult = await query<{
      page_slug: string;
      title: string;
      category: string;
    }>(`
      SELECT n.page_slug, n.title, n.category
      FROM knowledge_graph_nodes n
      WHERE n.connection_count = 0
      ${category ? 'AND n.category = $1' : ''}
      ORDER BY n.importance_score DESC
    `, category ? [category] : []);

    for (const row of isolatedResult.rows) {
      gaps.push({
        gapType: 'isolated_concept',
        pageSlug: row.page_slug,
        description: `"${row.title}" has no connections to other content`,
        severity: 'medium',
        suggestedAction: 'Add cross-references to related topics',
        relatedPages: [],
      });
    }

    // 2. Find nodes with weak connections
    const weakConnectionsResult = await query<{
      page_slug: string;
      title: string;
      max_strength: number;
    }>(`
      SELECT n.page_slug, n.title,
             COALESCE(MAX(e.strength), 0) as max_strength
      FROM knowledge_graph_nodes n
      LEFT JOIN knowledge_graph_edges e ON (
        e.source_slug = n.page_slug OR e.target_slug = n.page_slug
      )
      ${category ? 'WHERE n.category = $1' : ''}
      GROUP BY n.page_slug, n.title
      HAVING COALESCE(MAX(e.strength), 0) < 0.5
      ORDER BY max_strength DESC
    `, category ? [category] : []);

    for (const row of weakConnectionsResult.rows) {
      gaps.push({
        gapType: 'weak_connection',
        pageSlug: row.page_slug,
        description: `"${row.title}" has only weak connections (max strength: ${row.max_strength.toFixed(2)})`,
        severity: row.max_strength < 0.3 ? 'high' : 'medium',
        suggestedAction: 'Strengthen relationships or add more relevant content',
        relatedPages: [],
      });
    }

    // 3. Find missing follow-up content
    const terminalNodesResult = await query<{
      page_slug: string;
      title: string;
      outgoing_count: number;
    }>(`
      SELECT n.page_slug, n.title,
             COUNT(e_out.id) as outgoing_count
      FROM knowledge_graph_nodes n
      LEFT JOIN knowledge_graph_edges e_out ON e_out.source_slug = n.page_slug
      ${category ? 'WHERE n.category = $1' : ''}
      GROUP BY n.page_slug, n.title
      HAVING COUNT(e_out.id) = 0
        AND EXISTS (
          SELECT 1 FROM knowledge_graph_edges e_in
          WHERE e_in.target_slug = n.page_slug
        )
      ORDER BY n.importance_score DESC
    `, category ? [category] : []);

    for (const row of terminalNodesResult.rows) {
      gaps.push({
        gapType: 'missing_follow_up',
        pageSlug: row.page_slug,
        description: `"${row.title}" is referenced by other content but has no follow-up topics`,
        severity: 'low',
        suggestedAction: 'Add advanced topics or related concepts',
        relatedPages: [],
      });
    }

  } catch (error) {
    console.error('Error detecting knowledge gaps:', error);
  }

  return gaps.slice(0, 50); // Limit results
}

// Helper functions

function estimateNodeTime(nodeType: GraphNode['nodeType'], difficultyScore: number): number {
  const baseMinutes = {
    concept: 15,
    tutorial: 30,
    reference: 10,
    example: 20,
    tool: 25,
  };

  const difficultyMultiplier = Math.max(0.5, difficultyScore / 3);
  return Math.round(baseMinutes[nodeType] * difficultyMultiplier);
}

function generatePathId(start: string, end: string): string {
  return `path-${start.replace(/[^a-z0-9]/gi, '-')}-to-${end.replace(/[^a-z0-9]/gi, '-')}`;
}

function generateCompletionCriteria(nodes: LearningPathNode[]): string[] {
  const criteria = ['Complete all required topics'];

  const tutorialCount = nodes.filter(n => n.nodeType === 'tutorial').length;
  const exampleCount = nodes.filter(n => n.nodeType === 'example').length;

  if (tutorialCount > 0) {
    criteria.push(`Complete ${tutorialCount} hands-on tutorial${tutorialCount > 1 ? 's' : ''}`);
  }

  if (exampleCount > 0) {
    criteria.push(`Review ${exampleCount} practical example${exampleCount > 1 ? 's' : ''}`);
  }

  criteria.push('Demonstrate understanding through practical application');

  return criteria;
}

async function findOptionalNodes(
  mainPath: string[],
  difficulty: LearningPath['difficulty'],
  maxOptional: number
): Promise<LearningPathNode[]> {
  // Find related nodes that aren't in the main path
  const optionalNodes: LearningPathNode[] = [];

  try {
    for (const slug of mainPath) {
      const neighbors = await getNodeNeighbors(slug, {
        direction: 'both',
        relationshipTypes: ['related', 'extends'],
        minStrength: 0.5,
      });

      for (const neighbor of neighbors) {
        if (mainPath.includes(neighbor.node.pageSlug) || optionalNodes.some(n => n.pageSlug === neighbor.node.pageSlug)) {
          continue;
        }

        optionalNodes.push({
          pageSlug: neighbor.node.pageSlug,
          title: neighbor.node.title,
          nodeType: neighbor.node.nodeType,
          order: 0, // Will be set later
          estimatedMinutes: estimateNodeTime(neighbor.node.nodeType, neighbor.node.difficultyScore || 3),
          isOptional: true,
          prerequisites: [],
          reasoning: `Related to ${slug} - provides additional context`,
          difficultyScore: neighbor.node.difficultyScore,
        });

        if (optionalNodes.length >= maxOptional) break;
      }

      if (optionalNodes.length >= maxOptional) break;
    }
  } catch (error) {
    console.warn('Error finding optional nodes:', error);
  }

  return optionalNodes.slice(0, maxOptional);
}

async function findAlternativePaths(
  startSlug: string,
  endSlug: string,
  mainPath: string[]
): Promise<AlternativePath[]> {
  // This is a simplified implementation - could be enhanced
  // to find genuinely alternative routes through the graph

  try {
    // Find different starting points that lead to the same end
    const endNeighbors = await getNodeNeighbors(endSlug, {
      direction: 'incoming',
      minStrength: 0.4,
    });

    const alternatives: AlternativePath[] = [];

    for (const neighbor of endNeighbors.slice(0, 2)) {
      if (!mainPath.includes(neighbor.node.pageSlug)) {
        const altPath = await findShortestPath(startSlug, neighbor.node.pageSlug);
        if (altPath && altPath.path.length > 1) {
          alternatives.push({
            reason: 'Alternative entry point',
            nodes: [...altPath.path, endSlug],
            description: `Via ${neighbor.node.title}`,
            estimatedMinutes: altPath.path.length * 20, // Rough estimate
          });
        }
      }
    }

    return alternatives;
  } catch (error) {
    console.warn('Error finding alternative paths:', error);
    return [];
  }
}

async function findMissingPrerequisites(pageSlug: string, knownPrereqs: string[]): Promise<string[]> {
  // This would analyze content to find references to topics not in our graph
  // For now, return empty array - could be enhanced with content analysis
  return [];
}