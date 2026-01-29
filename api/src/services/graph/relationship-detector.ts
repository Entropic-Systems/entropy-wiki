/**
 * Relationship Detector Service
 *
 * Automatically detects relationships between wiki pages using multiple signals:
 * - Semantic similarity (embeddings)
 * - Explicit link analysis (markdown links)
 * - Concept prerequisite analysis
 * - Temporal relationships
 */

import { query } from '../../db/client.js';
import {
  findSimilarContent,
  getPageSimilarity,
  SIMILARITY_THRESHOLDS,
  type SimilarityMatch,
} from '../semantic-similarity.js';

export interface DetectedRelationship {
  sourceSlug: string;
  targetSlug: string;
  relationshipType: RelationshipType;
  strength: number;
  confidence: number;
  detectedBy: string;
  evidence: RelationshipEvidence;
}

export interface RelationshipEvidence {
  semanticSimilarity?: number;
  explicitLinks?: string[];
  conceptOverlap?: string[];
  temporalSignals?: {
    sourceCreated: Date;
    targetCreated: Date;
    isUpdate?: boolean;
  };
  frequencySignals?: {
    coVisitation?: number;
    crossReferences?: number;
  };
}

export type RelationshipType =
  | 'prerequisite'
  | 'related'
  | 'extends'
  | 'contradicts'
  | 'supersedes'
  | 'references'
  | 'implements';

/**
 * Relationship detection thresholds
 */
export const RELATIONSHIP_THRESHOLDS = {
  prerequisite: {
    semantic: 0.70,
    conceptOverlap: 3,
    confidence: 0.80,
  },
  related: {
    semantic: 0.60,
    conceptOverlap: 2,
    confidence: 0.70,
  },
  extends: {
    semantic: 0.65,
    conceptOverlap: 4,
    confidence: 0.75,
  },
  references: {
    explicitLink: true,
    confidence: 0.90,
  },
  supersedes: {
    semantic: 0.80,
    temporal: true,
    confidence: 0.75,
  },
} as const;

/**
 * Extract explicit markdown links from content
 */
function extractMarkdownLinks(content: string): string[] {
  // Match markdown links: [text](url) and [text](page-slug)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2];

    // Check if it's an internal page link (slug format)
    if (url.startsWith('/docs/') || url.match(/^[a-z0-9-]+$/)) {
      // Extract slug from path or use directly if already a slug
      const slug = url.replace('/docs/', '').replace(/^\/+|\/+$/g, '');
      links.push(slug);
    }
  }

  return [...new Set(links)]; // Remove duplicates
}

/**
 * Extract key concepts from page content using simple keyword extraction
 */
function extractConcepts(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase();

  // Domain-specific concepts for entropy-wiki
  const conceptPatterns = [
    /\b(beads?|bead workflow|issue tracking)\b/g,
    /\b(gastown|multi-agent|agent coordination)\b/g,
    /\b(mcp|model context protocol)\b/g,
    /\b(claude api|anthropic|ai integration)\b/g,
    /\b(prompt engineering|prompt bank)\b/g,
    /\b(skills? bank|ai capabilities)\b/g,
    /\b(embeddings?|vector search|semantic)\b/g,
    /\b(postgres|database|sql)\b/g,
    /\b(next\.?js|react|typescript)\b/g,
    /\b(docker|containers|deployment)\b/g,
    /\b(git|version control|repository)\b/g,
    /\b(api|endpoints?|rest)\b/g,
    /\b(authentication|auth|security)\b/g,
    /\b(testing|jest|vitest)\b/g,
    /\b(configuration|config|setup)\b/g,
  ];

  const concepts: string[] = [];

  for (const pattern of conceptPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      concepts.push(...matches.map(m => m.trim()));
    }
  }

  return [...new Set(concepts)];
}

/**
 * Analyze if sourceSlug is a prerequisite for targetSlug
 */
function analyzePrerequisite(
  sourceConcepts: string[],
  targetConcepts: string[],
  sourceContent: string,
  targetContent: string
): { isPrerequisite: boolean; confidence: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;

  // Check for foundational concepts
  const foundationalTerms = ['setup', 'installation', 'getting started', 'basics', 'introduction'];
  const advancedTerms = ['advanced', 'complex', 'enterprise', 'production', 'optimization'];

  const sourceHasFoundational = foundationalTerms.some(term =>
    sourceContent.toLowerCase().includes(term)
  );
  const targetHasAdvanced = advancedTerms.some(term =>
    targetContent.toLowerCase().includes(term)
  );

  if (sourceHasFoundational && targetHasAdvanced) {
    score += 0.3;
    evidence.push('Source covers foundational concepts, target covers advanced topics');
  }

  // Check concept subset relationship
  const sharedConcepts = sourceConcepts.filter(concept =>
    targetConcepts.includes(concept)
  );

  if (sharedConcepts.length >= 2 && sourceConcepts.length < targetConcepts.length) {
    score += 0.4;
    evidence.push(`Shared concepts: ${sharedConcepts.join(', ')}`);
  }

  // Check for explicit prerequisite language
  const prereqPatterns = [
    /before.*you.*need/i,
    /prerequisite/i,
    /first.*install/i,
    /requires.*understanding/i,
  ];

  for (const pattern of prereqPatterns) {
    if (pattern.test(targetContent)) {
      score += 0.3;
      evidence.push('Target content mentions prerequisites');
      break;
    }
  }

  return {
    isPrerequisite: score >= 0.6,
    confidence: Math.min(score, 1.0),
    evidence,
  };
}

/**
 * Detect temporal relationships (supersedes, updates)
 */
function analyzeTemporalRelationship(
  sourceCreated: Date,
  targetCreated: Date,
  sourceTitle: string,
  targetTitle: string
): { type: RelationshipType | null; confidence: number; evidence: string[] } {
  const evidence: string[] = [];
  const timeDiff = targetCreated.getTime() - sourceCreated.getTime();
  const daysDiff = Math.abs(timeDiff) / (1000 * 60 * 60 * 24);

  // Check for version indicators
  const versionPattern = /v?\d+\.\d+|\d{4}|updated?|new|latest/i;
  const sourceHasVersion = versionPattern.test(sourceTitle);
  const targetHasVersion = versionPattern.test(targetTitle);

  if (daysDiff > 30 && targetHasVersion && sourceHasVersion) {
    if (timeDiff > 0) {
      evidence.push('Target created significantly after source with version indicators');
      return { type: 'supersedes', confidence: 0.7, evidence };
    }
  }

  return { type: null, confidence: 0, evidence };
}

/**
 * Detect all relationships for a single page
 */
export async function detectPageRelationships(
  sourceSlug: string,
  options?: {
    limit?: number;
    includeExisting?: boolean;
  }
): Promise<DetectedRelationship[]> {
  const limit = options?.limit ?? 20;
  const relationships: DetectedRelationship[] = [];

  try {
    // Get source page details
    const sourceResult = await query<{
      slug: string;
      title: string;
      content_md: string;
      created_at: Date;
    }>(`
      SELECT p.slug, p.title, pr.content_md, p.created_at
      FROM pages p
      JOIN page_revisions pr ON p.current_published_revision_id = pr.id
      WHERE p.slug = $1 AND p.status = 'published'
    `, [sourceSlug]);

    if (sourceResult.rows.length === 0) {
      return [];
    }

    const sourcePage = sourceResult.rows[0];
    const sourceConcepts = extractConcepts(sourcePage.title, sourcePage.content_md);
    const explicitLinks = extractMarkdownLinks(sourcePage.content_md);

    // 1. Find semantically similar pages
    const similarPages = await findSimilarContent(
      sourcePage.content_md,
      sourcePage.title,
      {
        limit: limit * 2,
        threshold: SIMILARITY_THRESHOLDS.RELATED,
        excludeSlugs: [sourceSlug],
      }
    );

    // 2. Process each similar page
    for (const similarPage of similarPages.slice(0, limit)) {
      const targetResult = await query<{
        title: string;
        content_md: string;
        created_at: Date;
      }>(`
        SELECT p.title, pr.content_md, p.created_at
        FROM pages p
        JOIN page_revisions pr ON p.current_published_revision_id = pr.id
        WHERE p.slug = $1 AND p.status = 'published'
      `, [similarPage.pageSlug]);

      if (targetResult.rows.length === 0) continue;

      const targetPage = targetResult.rows[0];
      const targetConcepts = extractConcepts(targetPage.title, targetPage.content_md);
      const sharedConcepts = sourceConcepts.filter(c => targetConcepts.includes(c));

      // Determine relationship type based on multiple signals
      let relationshipType: RelationshipType = 'related';
      let confidence = 0.7;
      let strength = similarPage.similarityScore;
      const evidence: RelationshipEvidence = {
        semanticSimilarity: similarPage.similarityScore,
        conceptOverlap: sharedConcepts,
      };

      // Check for explicit references
      if (explicitLinks.includes(similarPage.pageSlug)) {
        relationshipType = 'references';
        confidence = 0.90;
        strength = Math.max(strength, 0.8);
        evidence.explicitLinks = [similarPage.pageSlug];
      }

      // Check for prerequisite relationship
      const prereqAnalysis = analyzePrerequisite(
        sourceConcepts,
        targetConcepts,
        sourcePage.content_md,
        targetPage.content_md
      );

      if (prereqAnalysis.isPrerequisite && relationshipType !== 'references') {
        relationshipType = 'prerequisite';
        confidence = prereqAnalysis.confidence;
        strength = Math.max(strength, 0.7);
      }

      // Check for temporal relationships
      const temporalAnalysis = analyzeTemporalRelationship(
        sourcePage.created_at,
        targetPage.created_at,
        sourcePage.title,
        targetPage.title
      );

      if (temporalAnalysis.type && relationshipType !== 'references') {
        relationshipType = temporalAnalysis.type;
        confidence = temporalAnalysis.confidence;
        evidence.temporalSignals = {
          sourceCreated: sourcePage.created_at,
          targetCreated: targetPage.created_at,
        };
      }

      // Check for "extends" relationship
      if (sharedConcepts.length >= 4 && similarPage.similarityScore >= 0.65) {
        const sourceIsBasic = sourcePage.content_md.toLowerCase().includes('basic') ||
                             sourcePage.content_md.toLowerCase().includes('introduction');
        const targetIsAdvanced = targetPage.content_md.toLowerCase().includes('advanced') ||
                                targetPage.content_md.toLowerCase().includes('complex');

        if (sourceIsBasic && targetIsAdvanced) {
          relationshipType = 'extends';
          confidence = 0.75;
        }
      }

      relationships.push({
        sourceSlug,
        targetSlug: similarPage.pageSlug,
        relationshipType,
        strength,
        confidence,
        detectedBy: 'semantic-analysis',
        evidence,
      });
    }

    // 3. Process explicit links that weren't found in similarity search
    for (const linkedSlug of explicitLinks) {
      const alreadyProcessed = relationships.some(r => r.targetSlug === linkedSlug);
      if (alreadyProcessed) continue;

      // Verify the linked page exists
      const linkResult = await query(`
        SELECT slug FROM pages WHERE slug = $1 AND status = 'published'
      `, [linkedSlug]);

      if (linkResult.rows.length > 0) {
        relationships.push({
          sourceSlug,
          targetSlug: linkedSlug,
          relationshipType: 'references',
          strength: 0.8,
          confidence: 0.90,
          detectedBy: 'link-analysis',
          evidence: {
            explicitLinks: [linkedSlug],
          },
        });
      }
    }

    return relationships;
  } catch (error) {
    console.error('Error detecting page relationships:', error);
    return [];
  }
}

/**
 * Detect relationships for all pages in the wiki
 */
export async function detectAllRelationships(
  options?: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<DetectedRelationship[]> {
  const batchSize = options?.batchSize ?? 10;
  const allRelationships: DetectedRelationship[] = [];

  try {
    // Get all published pages
    const pagesResult = await query<{ slug: string }>(`
      SELECT slug FROM pages WHERE status = 'published' ORDER BY created_at
    `);

    const totalPages = pagesResult.rows.length;
    let processed = 0;

    // Process pages in batches
    for (let i = 0; i < totalPages; i += batchSize) {
      const batch = pagesResult.rows.slice(i, i + batchSize);

      const batchPromises = batch.map(page =>
        detectPageRelationships(page.slug, { limit: 10 })
      );

      const batchResults = await Promise.all(batchPromises);

      for (const relationships of batchResults) {
        allRelationships.push(...relationships);
      }

      processed += batch.length;
      options?.onProgress?.(processed, totalPages);
    }

    return allRelationships;
  } catch (error) {
    console.error('Error in bulk relationship detection:', error);
    return allRelationships; // Return what we have so far
  }
}