// Shared types for the Entropy Wiki API

export interface Page {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  visibility: 'public' | 'private';
  current_published_revision_id: string | null;
  current_draft_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageRevision {
  id: string;
  page_id: string;
  content_md: string;
  author_type: 'human' | 'ai';
  created_at: string;
}

export interface PageWithContent extends Page {
  content_md: string;
}

// API request/response types
export interface CreatePageRequest {
  slug: string;
  title: string;
  content_md: string;
  status?: 'draft' | 'published';
  visibility?: 'public' | 'private';
}

export interface UpdatePageRequest {
  title?: string;
  content_md?: string;
  visibility?: 'public' | 'private';
}

export interface ApiError {
  error: string;
  message: string;
}
