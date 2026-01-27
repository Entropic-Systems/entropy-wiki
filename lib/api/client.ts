import type {
  Page,
  PageWithContent,
  PageTreeNode,
  PagesResponse,
  PageResponse,
  CreatePageRequest,
  UpdatePageRequest,
  ApiError,
} from './types';

// Bulk action types - must match backend supported actions
export type BulkAction = 'publish' | 'unpublish' | 'delete';

export interface BulkActionRequest {
  page_ids: string[];
  action: BulkAction;
}

export interface BulkActionResult {
  page_id: string;
  success: boolean;
  error?: string;
}

export interface BulkActionResponse {
  message: string;
  results: BulkActionResult[];
}

// API base URL - defaults to localhost for dev, can be overridden via env
const API_BASE_URL = (() => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // In production, enforce HTTPS
  if (process.env.NODE_ENV === 'production') {
    console.error('NEXT_PUBLIC_API_URL must be set in production');
    // Return a safe default that will fail rather than use HTTP
    return 'https://api.example.com';
  }

  // Development default
  return 'http://localhost:3001';
})();

class ApiClient {
  private baseUrl: string;
  private adminPassword?: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Set admin password for authenticated requests
  setAdminPassword(password: string) {
    this.adminPassword = password;
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let error: ApiError;
      try {
        error = await response.json();
      } catch (parseError) {
        // Log parse error for debugging but don't expose details to avoid information disclosure
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to parse error response:', parseError);
        }
        error = {
          error: 'unknown_error',
          message: 'Request failed',
        };
      }
      throw new ApiClientError(error.error, error.message, response.status);
    }

    return response.json();
  }

  private async fetchWithAuth<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.adminPassword) {
      throw new ApiClientError('auth_required', 'Admin password not set', 401);
    }

    return this.fetch<T>(path, {
      ...options,
      headers: {
        ...options.headers,
        'X-Admin-Password': this.adminPassword,
      },
    });
  }

  // ============ Public Routes ============

  // Get all published public pages
  async getPublicPages(): Promise<Page[]> {
    const response = await this.fetch<PagesResponse>('/pages');
    return response.pages;
  }

  // Get a single published public page by slug
  async getPublicPage(slug: string): Promise<PageWithContent | null> {
    try {
      const response = await this.fetch<PageResponse>(`/pages/${encodeURIComponent(slug)}`);
      return response.page;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ============ Admin Routes ============

  // Get all pages (including drafts and private)
  async getAdminPages(): Promise<Page[]> {
    const response = await this.fetchWithAuth<PagesResponse>('/admin/pages');
    return response.pages;
  }

  // Get a single page by ID (for admin editing)
  async getAdminPage(id: string): Promise<PageWithContent | null> {
    try {
      const response = await this.fetchWithAuth<PageResponse>(`/admin/pages/${id}`);
      return response.page;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // Create a new page
  async createPage(data: CreatePageRequest): Promise<PageWithContent> {
    const response = await this.fetchWithAuth<{ page: PageWithContent }>('/admin/pages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.page;
  }

  // Update a page
  async updatePage(id: string, data: UpdatePageRequest): Promise<void> {
    await this.fetchWithAuth<{ message: string }>(`/admin/pages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Publish a page
  async publishPage(id: string): Promise<void> {
    await this.fetchWithAuth<{ message: string }>(`/admin/pages/${id}/publish`, {
      method: 'POST',
    });
  }

  // Unpublish a page
  async unpublishPage(id: string): Promise<void> {
    await this.fetchWithAuth<{ message: string }>(`/admin/pages/${id}/unpublish`, {
      method: 'POST',
    });
  }

  // Publish a section (page and all descendants)
  async publishSection(id: string): Promise<{ published_count: number; skipped_count: number }> {
    const response = await this.fetchWithAuth<{
      message: string;
      published_count: number;
      skipped_count: number;
    }>(`/admin/pages/${id}/publish-section`, {
      method: 'POST',
    });
    return { published_count: response.published_count, skipped_count: response.skipped_count };
  }

  // Unpublish a section (page and all descendants)
  async unpublishSection(id: string): Promise<{ unpublished_count: number }> {
    const response = await this.fetchWithAuth<{
      message: string;
      unpublished_count: number;
    }>(`/admin/pages/${id}/unpublish-section`, {
      method: 'POST',
    });
    return { unpublished_count: response.unpublished_count };
  }

  // Delete a page
  async deletePage(id: string): Promise<void> {
    await this.fetchWithAuth<{ message: string }>(`/admin/pages/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ Hierarchy & Bulk Operations ============

  // Get the page tree (hierarchical structure)
  async getPageTree(): Promise<PageTreeNode[]> {
    const response = await this.fetchWithAuth<{ tree: PageTreeNode[] }>('/admin/pages/tree');
    return response.tree;
  }

  // Move a page to a new parent with optional sort order
  async movePage(id: string, parentId: string | null, sortOrder?: number): Promise<void> {
    await this.fetchWithAuth<{ message: string }>(`/admin/pages/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ parent_id: parentId, sort_order: sortOrder }),
    });
  }

  // Bulk action on multiple pages
  async bulkAction(request: BulkActionRequest): Promise<BulkActionResponse> {
    return this.fetchWithAuth<BulkActionResponse>('/admin/pages/bulk', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Reorder pages within a parent
  async reorderPages(pageIds: string[], parentId: string | null): Promise<void> {
    await this.fetchWithAuth<{ message: string }>('/admin/pages/reorder', {
      method: 'POST',
      body: JSON.stringify({ page_ids: pageIds, parent_id: parentId }),
    });
  }
}

// Custom error class for API errors
export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// Singleton instance for client-side usage
export const apiClient = new ApiClient();

// Factory for creating configured clients (useful for SSR)
export function createApiClient(baseUrl?: string): ApiClient {
  return new ApiClient(baseUrl);
}

export type { ApiClient };
