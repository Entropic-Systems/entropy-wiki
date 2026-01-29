/**
 * Categorization Service - Main Entry Point
 *
 * Exports all categorization functionality:
 * - Category management
 * - Topic classification
 * - Placement advice
 */

// Category Manager
export {
  Category,
  CategoryTreeNode,
  CategoryAssignment,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryTree,
  getChildCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  assignPageToCategory,
  removePageFromCategory,
  getPageCategories,
  getCategoryPages,
  mergeCategories,
  getCategoryStats,
} from './category-manager.js';

// Topic Classifier
export {
  CategoryClassification,
  ClassificationResult,
  ClassificationOptions,
  classifyContent,
  autoCategorize,
  batchClassify,
  suggestNewCategories,
  invalidateCategoryCache,
} from './topic-classifier.js';

// Placement Advisor
export {
  PlacementSuggestion,
  PlacementAnalysis,
  PlacementOptions,
  analyzePlacement,
  suggestBreadcrumb,
  analyzeStructureHealth,
  suggestParentPage,
} from './placement-advisor.js';

/**
 * Convenience function: Fully categorize and place a new page
 */
export async function categorizeAndPlace(
  pageSlug: string,
  content: string,
  title: string,
  options: {
    autoApply?: boolean;
    requireReview?: boolean;
  } = {}
): Promise<{
  classification: import('./topic-classifier.js').ClassificationResult;
  placement: import('./placement-advisor.js').PlacementAnalysis;
  applied: boolean;
}> {
  const { autoCategorize } = await import('./topic-classifier.js');
  const { analyzePlacement } = await import('./placement-advisor.js');

  const [classificationResult, placementResult] = await Promise.all([
    autoCategorize(pageSlug, content, title, {
      apply: options.autoApply && !options.requireReview,
    }),
    analyzePlacement(content, title),
  ]);

  return {
    classification: classificationResult,
    placement: placementResult,
    applied: classificationResult.applied,
  };
}

/**
 * Batch process uncategorized pages
 */
export async function processUncategorizedPages(
  options: {
    limit?: number;
    autoApply?: boolean;
    minConfidence?: number;
  } = {}
): Promise<{
  processed: number;
  categorized: number;
  needsReview: number;
  errors: Array<{ slug: string; error: string }>;
}> {
  const { limit = 100, autoApply = false, minConfidence = 0.7 } = options;

  const { query } = await import('../../db/client.js');
  const { autoCategorize } = await import('./topic-classifier.js');

  // Get uncategorized pages
  const pagesResult = await query<{
    slug: string;
    title: string;
    content_md: string;
  }>(`
    SELECT p.slug, p.title, pr.content_md
    FROM pages p
    JOIN page_revisions pr ON p.current_published_revision_id = pr.id
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_slug = p.slug)
    LIMIT $1
  `, [limit]);

  const stats = {
    processed: 0,
    categorized: 0,
    needsReview: 0,
    errors: [] as Array<{ slug: string; error: string }>,
  };

  for (const page of pagesResult.rows) {
    try {
      const result = await autoCategorize(page.slug, page.content_md, page.title, {
        apply: autoApply,
        minConfidence,
      });

      stats.processed++;

      if (result.applied) {
        stats.categorized++;
      } else if (result.requiresReview) {
        stats.needsReview++;
      }
    } catch (error: any) {
      stats.errors.push({
        slug: page.slug,
        error: error.message || 'Unknown error',
      });
    }
  }

  return stats;
}
