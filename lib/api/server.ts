/**
 * Server-side API helpers for fetching pages
 * Used in RSC for dynamic content with filesystem fallback
 */

import type { PageWithContent } from './types';
import type { MDXDocument } from '../mdx/types';

// API base URL - server-side version
const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Fetch a page from the API by slug
 * Returns null if not found or API unavailable
 */
export async function fetchPageFromApi(slug: string): Promise<PageWithContent | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(slug)}`, {
      next: { revalidate: 0 }, // Always fetch fresh
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.error(`API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data.page as PageWithContent;
  } catch (err) {
    // API unavailable - fall back to filesystem
    console.log('API unavailable, falling back to filesystem:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

/**
 * Fetch all pages from the API
 * Returns empty array if API unavailable
 */
export async function fetchAllPagesFromApi(): Promise<PageWithContent[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/pages`, {
      next: { revalidate: 0 },
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return data.pages || [];
  } catch (err) {
    console.log('API unavailable for page list:', err instanceof Error ? err.message : 'Unknown error');
    return [];
  }
}

/**
 * Convert API page to MDXDocument format for rendering compatibility
 */
export function pageToMDXDocument(page: PageWithContent, slugArray: string[]): MDXDocument {
  // Extract title from content or use page title
  const titleMatch = page.content_md.match(/^#\s+(.+)$/m);
  const extractedTitle = titleMatch ? titleMatch[1].trim() : page.title;

  return {
    frontMatter: {
      title: extractedTitle,
      description: undefined, // API pages don't have description yet
      draft: page.status === 'draft',
    },
    content: page.content_md,
    slug: slugArray.join('/'),
    filePath: `db:${page.id}`, // Mark as coming from DB
  };
}

/**
 * Check if the API is available
 */
export async function isApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      next: { revalidate: 0 },
    });
    return response.ok;
  } catch {
    return false;
  }
}
