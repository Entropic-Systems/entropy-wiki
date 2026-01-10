import type {
  Page,
  PageWithContent,
  PagesResponse,
  PageResponse,
  CreatePageRequest,
  UpdatePageRequest,
  ApiError,
} from './types';

// API base URL - defaults to localhost for dev, can be overridden via env
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
      const error: ApiError = await response.json().catch(() => ({
        error: 'unknown_error',
        message: `HTTP ${response.status}: ${response.statusText}`,
      }));
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

  // Delete a page
  async deletePage(id: string): Promise<void> {
    await this.fetchWithAuth<{ message: string }>(`/admin/pages/${id}`, {
      method: 'DELETE',
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
