/**
 * Knowledge Graph Services
 *
 * Exports all graph-related functionality for the Content Relationship Graph feature.
 * Provides relationship detection, graph storage, and learning path generation.
 */

// Relationship Detection
export {
  detectPageRelationships,
  detectAllRelationships,
  type DetectedRelationship,
  type RelationshipEvidence,
  type RelationshipType,
  RELATIONSHIP_THRESHOLDS,
} from './relationship-detector.js';

// Graph Storage and Traversal
export {
  upsertGraphNode,
  upsertGraphEdge,
  storeDetectedRelationships,
  getNodeNeighbors,
  findShortestPath,
  getNodesByCategory,
  updateConnectionCounts,
  getGraphStats,
  clearAutoDetectedRelationships,
  type GraphNode,
  type GraphEdge,
  type GraphStats,
  type TraversalOptions,
} from './graph-store.js';

// Learning Path Generation
export {
  generateLearningPath,
  getPrerequisitesForNode,
  generateCategoryLearningPath,
  detectKnowledgeGaps,
  type LearningPath,
  type LearningPathNode,
  type AlternativePath,
  type PrerequisiteChain,
  type PrerequisiteNode,
  type KnowledgeGap,
} from './path-generator.js';