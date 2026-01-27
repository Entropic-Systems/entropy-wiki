/**
 * Input validation and sanitization utilities
 */

/**
 * Validate slug format
 * - Must be URL-safe
 * - No path traversal attempts
 * - Reasonable length
 */
export function validateSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Check length
  if (slug.length === 0 || slug.length > 255) {
    return false;
  }

  // Must match URL-safe pattern (alphanumeric, hyphens, underscores, forward slashes)
  if (!/^[a-zA-Z0-9_\-\/]+$/.test(slug)) {
    return false;
  }

  // No double slashes
  if (slug.includes('//')) {
    return false;
  }

  // No path traversal
  if (slug.includes('..') || slug.includes('\\')) {
    return false;
  }

  // Must not start or end with slash
  if (slug.startsWith('/') || slug.endsWith('/')) {
    return false;
  }

  return true;
}

/**
 * Validate title
 * - Reasonable length
 * - No dangerous characters
 */
export function validateTitle(title: string): boolean {
  if (!title || typeof title !== 'string') {
    return false;
  }

  // Check length
  if (title.trim().length === 0 || title.length > 500) {
    return false;
  }

  // No control characters
  if (/[\x00-\x1F\x7F]/.test(title)) {
    return false;
  }

  return true;
}

/**
 * Validate markdown content
 * - Reasonable size
 * - No null bytes
 */
export function validateContent(content: string): boolean {
  if (typeof content !== 'string') {
    return false;
  }

  // Allow empty content
  if (content.length === 0) {
    return true;
  }

  // Max 10MB
  if (content.length > 10 * 1024 * 1024) {
    return false;
  }

  // No null bytes
  if (content.includes('\x00')) {
    return false;
  }

  return true;
}

/**
 * Validate UUID format
 */
export function validateUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize string for safe display
 * - Trim whitespace
 * - Remove control characters
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove control characters except newlines and tabs
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}