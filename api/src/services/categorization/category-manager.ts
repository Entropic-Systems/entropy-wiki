/**
 * Category Manager Service
 *
 * Handles hierarchical category CRUD operations:
 * - Category tree management
 * - Synonym handling
 * - Usage statistics
 * - Category merging/splitting
 */

import { query } from '../../db/client.js';

/**
 * Category data structure
 */
export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  pageCount: number;
  createdAt: Date;
}

/**
 * Category tree node
 */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  depth: number;
  path: string[];
}

/**
 * Category with page assignment info
 */
export interface CategoryAssignment {
  categoryId: string;
  confidence: number;
  isPrimary: boolean;
  assignedBy: 'system' | 'user' | 'ai';
  assignedAt: Date;
}

/**
 * Get all categories as a flat list
 */
export async function getAllCategories(): Promise<Category[]> {
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
    ORDER BY sort_order, name
  `);

  return result.rows.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    pageCount: row.page_count,
    createdAt: row.created_at,
  }));
}

/**
 * Get category by ID
 */
export async function getCategoryById(id: string): Promise<Category | null> {
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
 * Get category by slug
 */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
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
    WHERE slug = $1
  `, [slug]);

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
 * Build category tree from flat list
 */
export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodeMap = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  // Create nodes
  for (const cat of categories) {
    nodeMap.set(cat.id, {
      ...cat,
      children: [],
      depth: 0,
      path: [cat.slug],
    });
  }

  // Build tree
  for (const cat of categories) {
    const node = nodeMap.get(cat.id)!;

    if (cat.parentId && nodeMap.has(cat.parentId)) {
      const parent = nodeMap.get(cat.parentId)!;
      node.depth = parent.depth + 1;
      node.path = [...parent.path, cat.slug];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children at each level
  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);

  return roots;
}

/**
 * Get category tree
 */
export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const categories = await getAllCategories();
  return buildCategoryTree(categories);
}

/**
 * Get children of a category
 */
export async function getChildCategories(parentId: string): Promise<Category[]> {
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
    WHERE parent_id = $1
    ORDER BY sort_order, name
  `, [parentId]);

  return result.rows.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    pageCount: row.page_count,
    createdAt: row.created_at,
  }));
}

/**
 * Create a new category
 */
export async function createCategory(data: {
  name: string;
  slug: string;
  parentId?: string | null;
  description?: string;
  icon?: string;
  sortOrder?: number;
}): Promise<Category> {
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
    INSERT INTO categories (name, slug, parent_id, description, icon, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, slug, name, parent_id, description, icon, sort_order, page_count, created_at
  `, [
    data.name,
    data.slug,
    data.parentId || null,
    data.description || null,
    data.icon || null,
    data.sortOrder ?? 0,
  ]);

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
 * Update a category
 */
export async function updateCategory(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    parentId: string | null;
    description: string | null;
    icon: string | null;
    sortOrder: number;
  }>
): Promise<Category | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.slug !== undefined) {
    updates.push(`slug = $${paramIndex++}`);
    values.push(data.slug);
  }
  if (data.parentId !== undefined) {
    updates.push(`parent_id = $${paramIndex++}`);
    values.push(data.parentId);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.icon !== undefined) {
    updates.push(`icon = $${paramIndex++}`);
    values.push(data.icon);
  }
  if (data.sortOrder !== undefined) {
    updates.push(`sort_order = $${paramIndex++}`);
    values.push(data.sortOrder);
  }

  if (updates.length === 0) {
    return getCategoryById(id);
  }

  values.push(id);

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
    UPDATE categories
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, slug, name, parent_id, description, icon, sort_order, page_count, created_at
  `, values);

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
 * Delete a category
 */
export async function deleteCategory(id: string): Promise<boolean> {
  // First, update children to have no parent
  await query(`UPDATE categories SET parent_id = NULL WHERE parent_id = $1`, [id]);

  // Remove page associations
  await query(`DELETE FROM page_categories WHERE category_id = $1`, [id]);

  // Delete the category
  const result = await query(`DELETE FROM categories WHERE id = $1`, [id]);

  return (result.rowCount || 0) > 0;
}

/**
 * Assign a page to a category
 */
export async function assignPageToCategory(
  pageSlug: string,
  categoryId: string,
  options: {
    confidence?: number;
    isPrimary?: boolean;
    assignedBy?: 'system' | 'user' | 'ai';
  } = {}
): Promise<void> {
  const { confidence = 1.0, isPrimary = false, assignedBy = 'system' } = options;

  // If this is primary, unset other primary categories for this page
  if (isPrimary) {
    await query(`
      UPDATE page_categories
      SET is_primary = FALSE
      WHERE page_slug = $1 AND is_primary = TRUE
    `, [pageSlug]);
  }

  await query(`
    INSERT INTO page_categories (page_slug, category_id, confidence, is_primary, assigned_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (page_slug, category_id) DO UPDATE SET
      confidence = EXCLUDED.confidence,
      is_primary = EXCLUDED.is_primary,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = NOW()
  `, [pageSlug, categoryId, confidence, isPrimary, assignedBy]);

  // Update category page count
  await updateCategoryPageCount(categoryId);
}

/**
 * Remove a page from a category
 */
export async function removePageFromCategory(
  pageSlug: string,
  categoryId: string
): Promise<void> {
  await query(`
    DELETE FROM page_categories
    WHERE page_slug = $1 AND category_id = $2
  `, [pageSlug, categoryId]);

  // Update category page count
  await updateCategoryPageCount(categoryId);
}

/**
 * Get categories for a page
 */
export async function getPageCategories(pageSlug: string): Promise<Array<Category & CategoryAssignment>> {
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
    confidence: number;
    is_primary: boolean;
    assigned_by: string;
    assigned_at: Date;
  }>(`
    SELECT c.*, pc.confidence, pc.is_primary, pc.assigned_by, pc.assigned_at
    FROM categories c
    JOIN page_categories pc ON c.id = pc.category_id
    WHERE pc.page_slug = $1
    ORDER BY pc.is_primary DESC, pc.confidence DESC
  `, [pageSlug]);

  return result.rows.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    pageCount: row.page_count,
    createdAt: row.created_at,
    categoryId: row.id,
    confidence: row.confidence,
    isPrimary: row.is_primary,
    assignedBy: row.assigned_by as 'system' | 'user' | 'ai',
    assignedAt: row.assigned_at,
  }));
}

/**
 * Get pages in a category
 */
export async function getCategoryPages(
  categoryId: string,
  options: { includeChildren?: boolean; limit?: number; offset?: number } = {}
): Promise<Array<{ slug: string; title: string; confidence: number; isPrimary: boolean }>> {
  const { includeChildren = false, limit = 50, offset = 0 } = options;

  let sql: string;
  const params: any[] = [categoryId];

  if (includeChildren) {
    // Include pages from child categories
    sql = `
      WITH RECURSIVE category_tree AS (
        SELECT id FROM categories WHERE id = $1
        UNION ALL
        SELECT c.id FROM categories c
        JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT p.slug, p.title, pc.confidence, pc.is_primary
      FROM pages p
      JOIN page_categories pc ON p.slug = pc.page_slug
      WHERE pc.category_id IN (SELECT id FROM category_tree)
        AND p.status = 'published'
      ORDER BY pc.is_primary DESC, pc.confidence DESC
      LIMIT $2 OFFSET $3
    `;
    params.push(limit, offset);
  } else {
    sql = `
      SELECT p.slug, p.title, pc.confidence, pc.is_primary
      FROM pages p
      JOIN page_categories pc ON p.slug = pc.page_slug
      WHERE pc.category_id = $1
        AND p.status = 'published'
      ORDER BY pc.is_primary DESC, pc.confidence DESC
      LIMIT $2 OFFSET $3
    `;
    params.push(limit, offset);
  }

  const result = await query<{
    slug: string;
    title: string;
    confidence: number;
    is_primary: boolean;
  }>(sql, params);

  return result.rows.map(row => ({
    slug: row.slug,
    title: row.title,
    confidence: row.confidence,
    isPrimary: row.is_primary,
  }));
}

/**
 * Update category page count
 */
async function updateCategoryPageCount(categoryId: string): Promise<void> {
  await query(`
    UPDATE categories
    SET page_count = (
      SELECT COUNT(*) FROM page_categories
      WHERE category_id = $1
    )
    WHERE id = $1
  `, [categoryId]);
}

/**
 * Merge two categories (move pages from source to target, then delete source)
 */
export async function mergeCategories(
  sourceId: string,
  targetId: string
): Promise<void> {
  // Move all pages from source to target
  await query(`
    INSERT INTO page_categories (page_slug, category_id, confidence, is_primary, assigned_by)
    SELECT page_slug, $2, confidence, is_primary, 'system'
    FROM page_categories
    WHERE category_id = $1
    ON CONFLICT (page_slug, category_id) DO UPDATE SET
      confidence = GREATEST(page_categories.confidence, EXCLUDED.confidence)
  `, [sourceId, targetId]);

  // Move child categories to target
  await query(`
    UPDATE categories
    SET parent_id = $2
    WHERE parent_id = $1
  `, [sourceId, targetId]);

  // Delete source category
  await deleteCategory(sourceId);

  // Update target page count
  await updateCategoryPageCount(targetId);
}

/**
 * Get category statistics
 */
export async function getCategoryStats(): Promise<{
  totalCategories: number;
  totalAssignments: number;
  averagePageCount: number;
  maxDepth: number;
  uncategorizedPages: number;
}> {
  const [countResult, assignmentResult, avgResult, depthResult, uncategorizedResult] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) as count FROM categories`),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM page_categories`),
    query<{ avg: string }>(`SELECT AVG(page_count)::numeric(10,2) as avg FROM categories`),
    query<{ max_depth: string }>(`
      WITH RECURSIVE category_depth AS (
        SELECT id, 1 as depth FROM categories WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, cd.depth + 1
        FROM categories c
        JOIN category_depth cd ON c.parent_id = cd.id
      )
      SELECT MAX(depth) as max_depth FROM category_depth
    `),
    query<{ count: string }>(`
      SELECT COUNT(*) as count FROM pages p
      WHERE p.status = 'published'
        AND NOT EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_slug = p.slug)
    `),
  ]);

  return {
    totalCategories: parseInt(countResult.rows[0].count),
    totalAssignments: parseInt(assignmentResult.rows[0].count),
    averagePageCount: parseFloat(avgResult.rows[0].avg || '0'),
    maxDepth: parseInt(depthResult.rows[0].max_depth || '0'),
    uncategorizedPages: parseInt(uncategorizedResult.rows[0].count),
  };
}
