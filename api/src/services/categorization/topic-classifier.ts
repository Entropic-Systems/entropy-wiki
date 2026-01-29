/**
 * Topic Classifier Service
 *
 * AI-powered content classification using embeddings:
 * - Multi-label classification
 * - Hierarchical category awareness
 * - Confidence scoring
 * - Human-in-the-loop for low confidence
 */

import { query } from '../../db/client.js';
import { generateEmbedding } from '../embeddings.js';
import {
  Category,
  getAllCategories,
  getCategoryTree,
  CategoryTreeNode,
  assignPageToCategory,
} from './category-manager.js';

/**
 * Classification result for a single category
 */
export interface CategoryClassification {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  confidence: number;
  path: string[];
  matchReasons: string[];
}

/**
 * Full classification result
 */
export interface ClassificationResult {
  primary: CategoryClassification | null;
  secondary: CategoryClassification[];
  suggestions: CategoryClassification[];
  requiresReview: boolean;
  reviewReason?: string;
}

/**
 * Classification options
 */
export interface ClassificationOptions {
  maxCategories?: number;
  minConfidence?: number;
  reviewThreshold?: number;
  preferExisting?: boolean;
}

/**
 * Default classification options
 */
const DEFAULT_OPTIONS: Required<ClassificationOptions> = {
  maxCategories: 5,
  minConfidence: 0.3,
  reviewThreshold: 0.6,
  preferExisting: true,
};

/**
 * Category embedding cache
 */
interface CategoryEmbedding {
  categoryId: string;
  embedding: number[];
  keywords: string[];
}

let categoryEmbeddingsCache: CategoryEmbedding[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate or retrieve category embeddings
 */
async function getCategoryEmbeddings(): Promise<CategoryEmbedding[]> {
  const now = Date.now();

  if (categoryEmbeddingsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return categoryEmbeddingsCache;
  }

  const categories = await getAllCategories();
  const embeddings: CategoryEmbedding[] = [];

  for (const category of categories) {
    // Generate text representation of category
    const categoryText = [
      category.name,
      category.description || '',
      category.slug.replace(/-/g, ' '),
    ].filter(Boolean).join(' ');

    try {
      const embedding = await generateEmbedding(categoryText);

      // Extract keywords from category name/description
      const keywords = extractKeywords(categoryText);

      embeddings.push({
        categoryId: category.id,
        embedding,
        keywords,
      });
    } catch (error) {
      console.warn(`Failed to generate embedding for category ${category.slug}:`, error);
    }
  }

  categoryEmbeddingsCache = embeddings;
  cacheTimestamp = now;

  return embeddings;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'and', 'or', 'but',
    'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Calculate keyword overlap score
 */
function keywordOverlap(contentKeywords: string[], categoryKeywords: string[]): number {
  if (contentKeywords.length === 0 || categoryKeywords.length === 0) return 0;

  const contentSet = new Set(contentKeywords);
  let matches = 0;

  for (const keyword of categoryKeywords) {
    if (contentSet.has(keyword)) matches++;
  }

  return matches / Math.max(contentKeywords.length, categoryKeywords.length);
}

/**
 * Classify content into categories
 */
export async function classifyContent(
  content: string,
  title: string,
  options: ClassificationOptions = {}
): Promise<ClassificationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Generate content embedding
  const contentText = `${title}\n\n${content}`;
  const contentEmbedding = await generateEmbedding(contentText);
  const contentKeywords = extractKeywords(contentText);

  // Get category embeddings
  const categoryEmbeddings = await getCategoryEmbeddings();

  // Get category tree for path information
  const categoryTree = await getCategoryTree();
  const categoryPaths = buildCategoryPaths(categoryTree);

  // Score each category and collect those that pass threshold
  const preliminaryScores: Array<{
    categoryId: string;
    confidence: number;
    semanticScore: number;
    keywordScore: number;
    path: string[];
  }> = [];

  for (const catEmb of categoryEmbeddings) {
    // Semantic similarity (70% weight)
    const semanticScore = cosineSimilarity(contentEmbedding, catEmb.embedding);

    // Keyword overlap (30% weight)
    const keywordScore = keywordOverlap(contentKeywords, catEmb.keywords);

    // Combined score
    const confidence = semanticScore * 0.7 + keywordScore * 0.3;

    if (confidence >= opts.minConfidence) {
      const path = categoryPaths.get(catEmb.categoryId) || [];
      preliminaryScores.push({
        categoryId: catEmb.categoryId,
        confidence,
        semanticScore,
        keywordScore,
        path,
      });
    }
  }

  // Batch fetch all needed categories in a single query (N+1 query fix)
  const categoryIds = preliminaryScores.map(s => s.categoryId);
  const categoriesMap = await getCategoriesByIds(categoryIds);

  // Build final scores using the batch-fetched categories
  const scores: CategoryClassification[] = [];
  for (const prelim of preliminaryScores) {
    const category = categoriesMap.get(prelim.categoryId);
    if (category) {
      const matchReasons: string[] = [];
      if (prelim.semanticScore >= 0.5) matchReasons.push(`High semantic similarity (${(prelim.semanticScore * 100).toFixed(0)}%)`);
      if (prelim.keywordScore >= 0.3) matchReasons.push(`Keyword match (${(prelim.keywordScore * 100).toFixed(0)}%)`);

      scores.push({
        categoryId: prelim.categoryId,
        categorySlug: category.slug,
        categoryName: category.name,
        confidence: prelim.confidence,
        path: prelim.path,
        matchReasons,
      });
    }
  }

  // Sort by confidence
  scores.sort((a, b) => b.confidence - a.confidence);

  // Select primary, secondary, and suggestions
  const topScores = scores.slice(0, opts.maxCategories);

  const primary = topScores.length > 0 && topScores[0].confidence >= opts.reviewThreshold
    ? topScores[0]
    : null;

  const secondary = primary
    ? topScores.slice(1).filter(s => s.confidence >= opts.reviewThreshold)
    : [];

  const suggestions = topScores.filter(s =>
    s.confidence < opts.reviewThreshold &&
    s.confidence >= opts.minConfidence
  );

  // Determine if review is needed
  const requiresReview = primary === null || primary.confidence < 0.8;
  let reviewReason: string | undefined;

  if (!primary) {
    reviewReason = 'No category met the confidence threshold';
  } else if (primary.confidence < opts.reviewThreshold) {
    reviewReason = 'Primary category confidence is below threshold';
  } else if (primary.confidence < 0.8) {
    reviewReason = 'Classification confidence is moderate';
  }

  return {
    primary,
    secondary,
    suggestions,
    requiresReview,
    reviewReason,
  };
}

/**
 * Helper to get category by ID (simplified)
 */
async function getCategoryById(id: string): Promise<{ slug: string; name: string } | null> {
  const result = await query<{ slug: string; name: string }>(`
    SELECT slug, name FROM categories WHERE id = $1
  `, [id]);

  return result.rows[0] || null;
}

/**
 * Batch fetch categories by IDs (avoids N+1 queries)
 */
async function getCategoriesByIds(ids: string[]): Promise<Map<string, { slug: string; name: string }>> {
  if (ids.length === 0) {
    return new Map();
  }

  const result = await query<{ id: string; slug: string; name: string }>(`
    SELECT id, slug, name FROM categories WHERE id = ANY($1)
  `, [ids]);

  const map = new Map<string, { slug: string; name: string }>();
  for (const row of result.rows) {
    map.set(row.id, { slug: row.slug, name: row.name });
  }
  return map;
}

/**
 * Build map of category ID to path
 */
function buildCategoryPaths(tree: CategoryTreeNode[]): Map<string, string[]> {
  const paths = new Map<string, string[]>();

  function traverse(nodes: CategoryTreeNode[]) {
    for (const node of nodes) {
      paths.set(node.id, node.path);
      traverse(node.children);
    }
  }

  traverse(tree);
  return paths;
}

/**
 * Auto-categorize a page and apply categories
 */
export async function autoCategorize(
  pageSlug: string,
  content: string,
  title: string,
  options: ClassificationOptions & { apply?: boolean } = {}
): Promise<ClassificationResult & { applied: boolean }> {
  const { apply = true, ...classifyOptions } = options;

  const result = await classifyContent(content, title, classifyOptions);

  if (apply && result.primary && !result.requiresReview) {
    // Apply primary category
    await assignPageToCategory(pageSlug, result.primary.categoryId, {
      confidence: result.primary.confidence,
      isPrimary: true,
      assignedBy: 'ai',
    });

    // Apply high-confidence secondary categories
    for (const sec of result.secondary) {
      if (sec.confidence >= 0.7) {
        await assignPageToCategory(pageSlug, sec.categoryId, {
          confidence: sec.confidence,
          isPrimary: false,
          assignedBy: 'ai',
        });
      }
    }

    return { ...result, applied: true };
  }

  return { ...result, applied: false };
}

/**
 * Batch classify multiple pages
 */
export async function batchClassify(
  pages: Array<{ slug: string; content: string; title: string }>,
  options: ClassificationOptions = {}
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();

  for (const page of pages) {
    try {
      const result = await classifyContent(page.content, page.title, options);
      results.set(page.slug, result);
    } catch (error) {
      console.error(`Failed to classify page ${page.slug}:`, error);
    }
  }

  return results;
}

/**
 * Suggest new categories based on uncategorized content
 */
export async function suggestNewCategories(
  threshold: number = 5
): Promise<Array<{ suggestedName: string; pageCount: number; examplePages: string[] }>> {
  // This would use clustering on embeddings of uncategorized pages
  // to identify potential new categories
  // Simplified implementation for now

  const uncategorizedResult = await query<{
    slug: string;
    title: string;
    content_md: string;
  }>(`
    SELECT p.slug, p.title, pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_slug = p.slug)
    LIMIT 100
  `);

  if (uncategorizedResult.rows.length < threshold) {
    return [];
  }

  // Extract common keywords from uncategorized pages
  const keywordCounts = new Map<string, number>();
  const keywordPages = new Map<string, string[]>();

  for (const page of uncategorizedResult.rows) {
    const keywords = extractKeywords(`${page.title} ${page.content_md}`);
    for (const keyword of keywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
      const pages = keywordPages.get(keyword) || [];
      pages.push(page.slug);
      keywordPages.set(keyword, pages);
    }
  }

  // Find keywords that appear in multiple uncategorized pages
  const suggestions: Array<{ suggestedName: string; pageCount: number; examplePages: string[] }> = [];

  for (const [keyword, count] of keywordCounts) {
    if (count >= threshold) {
      const pages = keywordPages.get(keyword) || [];
      suggestions.push({
        suggestedName: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        pageCount: count,
        examplePages: pages.slice(0, 5),
      });
    }
  }

  // Sort by page count
  suggestions.sort((a, b) => b.pageCount - a.pageCount);

  return suggestions.slice(0, 10);
}

/**
 * Invalidate category embeddings cache
 */
export function invalidateCategoryCache(): void {
  categoryEmbeddingsCache = null;
  cacheTimestamp = 0;
}
