/**
 * Placement Advisor Service
 *
 * Suggests optimal wiki placement for content:
 * - Wiki structure analysis
 * - Sibling page comparison
 * - Path optimization
 * - Cross-section linking suggestions
 */

import { query } from '../../db/client.js';
import { generateEmbedding, findSimilarPages } from '../embeddings.js';
import {
  getCategoryTree,
  getCategoryPages,
  getPageCategories,
  CategoryTreeNode,
  Category,
} from './category-manager.js';
import { classifyContent, ClassificationResult } from './topic-classifier.js';

/**
 * Placement suggestion
 */
export interface PlacementSuggestion {
  parentSlug: string | null;
  parentTitle: string | null;
  categoryId: string | null;
  categoryPath: string[];
  confidence: number;
  reasoning: string[];
  siblingPages: Array<{ slug: string; title: string; similarity: number }>;
  crossLinks: Array<{ slug: string; title: string; reason: string }>;
}

/**
 * Placement analysis result
 */
export interface PlacementAnalysis {
  recommended: PlacementSuggestion;
  alternatives: PlacementSuggestion[];
  structureInsights: {
    currentDepth: number;
    maxRecommendedDepth: number;
    similarPagesExist: boolean;
    categoryMatch: boolean;
  };
}

/**
 * Placement options
 */
export interface PlacementOptions {
  maxDepth?: number;
  preferShallower?: boolean;
  requireCategory?: boolean;
  considerExistingLinks?: boolean;
}

/**
 * Default placement options
 */
const DEFAULT_OPTIONS: Required<PlacementOptions> = {
  maxDepth: 4,
  preferShallower: true,
  requireCategory: false,
  considerExistingLinks: true,
};

/**
 * Analyze wiki structure for optimal placement
 */
export async function analyzePlacement(
  content: string,
  title: string,
  options: PlacementOptions = {}
): Promise<PlacementAnalysis> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Classify content to find relevant categories
  const classification = await classifyContent(content, title);

  // 2. Find similar existing pages
  const similarPages = await findSimilarPages(content, 10, 0.3);

  // 3. Get category tree for structure analysis
  const categoryTree = await getCategoryTree();

  // 4. Build suggestions based on multiple signals
  const suggestions: PlacementSuggestion[] = [];

  // Category-based suggestion
  if (classification.primary) {
    const categoryPages = await getCategoryPages(classification.primary.categoryId, {
      limit: 5,
    });

    const siblingPages = categoryPages.map(p => ({
      slug: p.slug,
      title: p.title,
      similarity: p.confidence,
    }));

    suggestions.push({
      parentSlug: null, // Would need page hierarchy lookup
      parentTitle: null,
      categoryId: classification.primary.categoryId,
      categoryPath: classification.primary.path,
      confidence: classification.primary.confidence,
      reasoning: [
        `Matches category "${classification.primary.categoryName}" with ${(classification.primary.confidence * 100).toFixed(0)}% confidence`,
        ...classification.primary.matchReasons,
      ],
      siblingPages,
      crossLinks: await findCrossLinks(content, title, classification),
    });
  }

  // Similar page-based suggestion
  if (similarPages.length > 0) {
    const topSimilar = similarPages[0];
    const similarCategories = await getPageCategories(topSimilar.page_slug);

    if (similarCategories.length > 0) {
      const primaryCategory = similarCategories.find(c => c.isPrimary) || similarCategories[0];

      suggestions.push({
        parentSlug: null,
        parentTitle: null,
        categoryId: primaryCategory.id,
        categoryPath: [primaryCategory.slug],
        confidence: topSimilar.similarity * 0.8, // Discount slightly
        reasoning: [
          `Similar to "${topSimilar.page_title}" (${(topSimilar.similarity * 100).toFixed(0)}% similarity)`,
          `Would be sibling of similar existing content`,
        ],
        siblingPages: similarPages.slice(0, 5).map(p => ({
          slug: p.page_slug,
          title: p.page_title,
          similarity: p.similarity,
        })),
        crossLinks: await findCrossLinks(content, title, classification),
      });
    }
  }

  // Root-level suggestion if no good category match
  if (suggestions.length === 0 || suggestions[0].confidence < 0.5) {
    suggestions.push({
      parentSlug: null,
      parentTitle: 'Root',
      categoryId: null,
      categoryPath: [],
      confidence: 0.3,
      reasoning: [
        'No strong category match found',
        'Suggested as root-level page for manual categorization',
      ],
      siblingPages: [],
      crossLinks: await findCrossLinks(content, title, classification),
    });
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Determine structure insights
  const structureInsights = {
    currentDepth: 0, // Would need current location if updating
    maxRecommendedDepth: opts.maxDepth,
    similarPagesExist: similarPages.length > 0,
    categoryMatch: classification.primary !== null,
  };

  return {
    recommended: suggestions[0],
    alternatives: suggestions.slice(1),
    structureInsights,
  };
}

/**
 * Find pages that should be cross-linked
 */
async function findCrossLinks(
  content: string,
  title: string,
  classification: ClassificationResult
): Promise<Array<{ slug: string; title: string; reason: string }>> {
  const crossLinks: Array<{ slug: string; title: string; reason: string }> = [];

  // Get pages from related categories
  for (const secondary of classification.secondary.slice(0, 2)) {
    const categoryPages = await getCategoryPages(secondary.categoryId, { limit: 3 });

    for (const page of categoryPages) {
      crossLinks.push({
        slug: page.slug,
        title: page.title,
        reason: `Related via category "${secondary.categoryName}"`,
      });
    }
  }

  // Add suggestions from classification
  for (const suggestion of classification.suggestions.slice(0, 2)) {
    const categoryPages = await getCategoryPages(suggestion.categoryId, { limit: 2 });

    for (const page of categoryPages) {
      if (!crossLinks.some(l => l.slug === page.slug)) {
        crossLinks.push({
          slug: page.slug,
          title: page.title,
          reason: `Potentially related topic "${suggestion.categoryName}"`,
        });
      }
    }
  }

  return crossLinks.slice(0, 10);
}

/**
 * Suggest navigation breadcrumb for a page
 */
export async function suggestBreadcrumb(
  pageSlug: string
): Promise<Array<{ slug: string; title: string }>> {
  // Get page's primary category
  const categories = await getPageCategories(pageSlug);
  const primary = categories.find(c => c.isPrimary);

  if (!primary) {
    return [];
  }

  // Build breadcrumb from category path
  const breadcrumb: Array<{ slug: string; title: string }> = [];

  // Get full category tree to find ancestors
  const tree = await getCategoryTree();
  const path = findCategoryPath(tree, primary.id);

  for (const categoryId of path) {
    const cat = await getCategoryByIdFull(categoryId);
    if (cat) {
      // Find representative page for this category (or use category itself)
      const categoryPages = await getCategoryPages(categoryId, { limit: 1 });
      if (categoryPages.length > 0) {
        breadcrumb.push({
          slug: categoryPages[0].slug,
          title: cat.name,
        });
      }
    }
  }

  return breadcrumb;
}

/**
 * Find path to a category in the tree
 */
function findCategoryPath(tree: CategoryTreeNode[], targetId: string): string[] {
  for (const node of tree) {
    if (node.id === targetId) {
      return [node.id];
    }

    const childPath = findCategoryPath(node.children, targetId);
    if (childPath.length > 0) {
      return [node.id, ...childPath];
    }
  }

  return [];
}

/**
 * Get full category by ID
 */
async function getCategoryByIdFull(id: string): Promise<Category | null> {
  const result = await query<{
    id: string;
    slug: string;
    name: string;
    parent_id: string | null;
    description: string | null;
    icon: string | null;
    sort_order: number;
    page_count: number;
    created_at: Date;
  }>(`
    SELECT id, slug, name, parent_id, description, icon, sort_order, page_count, created_at
    FROM categories
    WHERE id = $1
  `, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    pageCount: row.page_count,
    createdAt: row.created_at,
  };
}

/**
 * Analyze wiki structure health
 */
export async function analyzeStructureHealth(): Promise<{
  totalPages: number;
  categorizedPages: number;
  uncategorizedPages: number;
  orphanPages: number;
  deepPages: number;
  categoryDistribution: Array<{ category: string; count: number }>;
  recommendations: string[];
}> {
  // Get counts
  const [totalResult, categorizedResult, orphanResult] = await Promise.all([
    query<{ count: string }>(`
      SELECT COUNT(*) as count FROM pages WHERE status = 'published'
    `),
    query<{ count: string }>(`
      SELECT COUNT(DISTINCT page_slug) as count FROM page_categories
    `),
    query<{ count: string }>(`
      SELECT COUNT(*) as count FROM pages p
      WHERE p.status = 'published'
        AND p.parent_id IS NULL
        AND p.slug != 'home'
        AND NOT EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_slug = p.slug)
    `),
  ]);

  const totalPages = parseInt(totalResult.rows[0].count);
  const categorizedPages = parseInt(categorizedResult.rows[0].count);
  const orphanPages = parseInt(orphanResult.rows[0].count);
  const uncategorizedPages = totalPages - categorizedPages;

  // Get category distribution
  const distributionResult = await query<{ name: string; count: string }>(`
    SELECT c.name, COUNT(pc.page_slug)::int as count
    FROM categories c
    LEFT JOIN page_categories pc ON c.id = pc.category_id
    GROUP BY c.id, c.name
    ORDER BY count DESC
    LIMIT 10
  `);

  const categoryDistribution = distributionResult.rows.map(r => ({
    category: r.name,
    count: parseInt(r.count),
  }));

  // Get deep pages count (more than 3 levels deep)
  const deepResult = await query<{ count: string }>(`
    WITH RECURSIVE page_depth AS (
      SELECT id, slug, parent_id, 1 as depth
      FROM pages
      WHERE parent_id IS NULL AND status = 'published'
      UNION ALL
      SELECT p.id, p.slug, p.parent_id, pd.depth + 1
      FROM pages p
      JOIN page_depth pd ON p.parent_id = pd.id
      WHERE p.status = 'published'
    )
    SELECT COUNT(*) as count FROM page_depth WHERE depth > 3
  `);

  const deepPages = parseInt(deepResult.rows[0]?.count || '0');

  // Generate recommendations
  const recommendations: string[] = [];

  if (uncategorizedPages > totalPages * 0.2) {
    recommendations.push(`${uncategorizedPages} pages (${((uncategorizedPages / totalPages) * 100).toFixed(0)}%) lack categories - consider running auto-categorization`);
  }

  if (orphanPages > 10) {
    recommendations.push(`${orphanPages} orphan pages found - consider linking them to parent pages or categories`);
  }

  if (deepPages > totalPages * 0.1) {
    recommendations.push(`${deepPages} pages are more than 3 levels deep - consider flattening structure`);
  }

  const maxCategory = categoryDistribution[0];
  const minCategory = categoryDistribution[categoryDistribution.length - 1];
  if (maxCategory && minCategory && maxCategory.count > minCategory.count * 10) {
    recommendations.push(`Category "${maxCategory.category}" has ${maxCategory.count} pages while "${minCategory.category}" has ${minCategory.count} - consider rebalancing`);
  }

  return {
    totalPages,
    categorizedPages,
    uncategorizedPages,
    orphanPages,
    deepPages,
    categoryDistribution,
    recommendations,
  };
}

/**
 * Suggest optimal parent page for new content
 */
export async function suggestParentPage(
  content: string,
  title: string
): Promise<Array<{ slug: string; title: string; confidence: number; reason: string }>> {
  // Find similar pages
  const similar = await findSimilarPages(content, 10, 0.3);

  const suggestions: Array<{ slug: string; title: string; confidence: number; reason: string }> = [];

  // For each similar page, suggest its parent
  for (const page of similar.slice(0, 5)) {
    const parentResult = await query<{ parent_slug: string; parent_title: string }>(`
      SELECT p2.slug as parent_slug, p2.title as parent_title
      FROM pages p1
      JOIN pages p2 ON p1.parent_id = p2.id
      WHERE p1.slug = $1
    `, [page.page_slug]);

    if (parentResult.rows.length > 0) {
      const parent = parentResult.rows[0];
      if (!suggestions.some(s => s.slug === parent.parent_slug)) {
        suggestions.push({
          slug: parent.parent_slug,
          title: parent.parent_title,
          confidence: page.similarity * 0.9,
          reason: `Parent of similar page "${page.page_title}"`,
        });
      }
    }
  }

  // Also suggest being a sibling (same parent) of similar pages
  for (const page of similar.slice(0, 3)) {
    if (!suggestions.some(s => s.slug === page.page_slug)) {
      suggestions.push({
        slug: page.page_slug,
        title: page.page_title,
        confidence: page.similarity * 0.7,
        reason: `Could be sibling of "${page.page_title}"`,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}
