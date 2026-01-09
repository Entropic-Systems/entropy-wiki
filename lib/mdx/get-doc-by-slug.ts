import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { MDXDocument } from './types'

const DOCS_DIR = path.join(process.cwd(), 'wiki')

/**
 * Convert slug to file path
 * Examples:
 *   "beads" -> wiki/beads/README.md
 *   "beads/lifecycle" -> wiki/beads/lifecycle.md
 */
function slugToFilePath(slug: string[]): string | null {
  const possiblePaths = [
    // Try exact path with .md
    path.join(DOCS_DIR, ...slug) + '.md',
    // Try exact path with .mdx
    path.join(DOCS_DIR, ...slug) + '.mdx',
    // Try as directory with README.md
    path.join(DOCS_DIR, ...slug, 'README.md'),
    // Try as directory with README.mdx
    path.join(DOCS_DIR, ...slug, 'README.mdx'),
  ]

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }

  return null
}

/**
 * Extract title from markdown content (first h1 or h2 heading)
 */
function extractTitleFromContent(content: string): string | null {
  // Try to find first h1 heading
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1].trim()
  }

  // Try to find first h2 heading
  const h2Match = content.match(/^##\s+(.+)$/m)
  if (h2Match) {
    return h2Match[1].trim()
  }

  return null
}

/**
 * Slugify a string to create a readable slug
 */
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Get a document by its slug (returns raw content for RSC rendering)
 */
export function getDocBySlug(slug: string[]): MDXDocument | null {
  try {
    const filePath = slugToFilePath(slug)

    if (!filePath) {
      return null
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(fileContent)

    // Determine title: frontmatter > extracted from content > slugified
    const extractedTitle = extractTitleFromContent(content)
    const fallbackTitle = slugToTitle(slug[slug.length - 1])
    const title = data.title || extractedTitle || fallbackTitle

    const frontMatter = {
      title,
      description: data.description,
      date: data.date,
      author: data.author,
      tags: data.tags || [],
      draft: data.draft || false,
      ...data,
    }

    const relativePath = filePath.replace(DOCS_DIR + path.sep, '')

    return {
      frontMatter,
      content,
      slug: slug.join('/'),
      filePath: relativePath,
    }
  } catch (error) {
    console.error(`Error getting doc for slug ${slug.join('/')}:`, error)
    return null
  }
}

/**
 * Check if a document exists for a given slug
 */
export function docExists(slug: string[]): boolean {
  return slugToFilePath(slug) !== null
}

/**
 * Get the file path for a slug (for reading file system directly)
 */
export function getDocFilePath(slug: string[]): string | null {
  return slugToFilePath(slug)
}
