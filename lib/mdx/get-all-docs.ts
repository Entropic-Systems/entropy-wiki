import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { FrontMatter, MDXDocument } from './types'

const DOCS_DIR = path.join(process.cwd(), 'wiki')

/**
 * Recursively get all markdown/MDX files from a directory
 */
function getMarkdownFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = []

  if (!fs.existsSync(dir)) {
    return files
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...getMarkdownFiles(fullPath, baseDir))
      }
    } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
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
 * Parse a markdown file and extract frontmatter + content
 */
function parseMarkdownFile(filePath: string, baseDir: string): MDXDocument | null {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(fileContent)

    // Generate slug from file path
    const relativePath = path.relative(baseDir, filePath)
    const slug = relativePath
      .replace(/\.(md|mdx)$/, '')
      .replace(/\\/g, '/')
      .replace(/\/README$/i, '')
      .replace(/^README$/i, '')
      .toLowerCase()

    // Determine title: frontmatter > extracted from content > filename
    const extractedTitle = extractTitleFromContent(content)
    const fallbackTitle = path.basename(filePath, path.extname(filePath))
    const title = data.title || extractedTitle || fallbackTitle

    const frontMatter: FrontMatter = {
      title,
      description: data.description,
      date: data.date,
      author: data.author,
      tags: data.tags || [],
      draft: data.draft || false,
      ...data,
    }

    return {
      frontMatter,
      content,
      slug,
      filePath: relativePath,
    }
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error)
    return null
  }
}

/**
 * Get all documentation files with their metadata
 */
export function getAllDocs(dir: string = DOCS_DIR): MDXDocument[] {
  const markdownFiles = getMarkdownFiles(dir)
  const docs = markdownFiles
    .map(file => parseMarkdownFile(file, dir))
    .filter((doc): doc is MDXDocument => doc !== null)
    .filter(doc => !doc.frontMatter.draft)

  return docs
}

/**
 * Get all docs from a specific section
 */
export function getDocsBySection(section: string): MDXDocument[] {
  const sectionDir = path.join(DOCS_DIR, section)
  return getAllDocs(sectionDir)
}

/**
 * Get all unique tags from all documents
 */
export function getAllTags(): string[] {
  const docs = getAllDocs()
  const tagSet = new Set<string>()

  docs.forEach(doc => {
    doc.frontMatter.tags?.forEach(tag => tagSet.add(tag))
  })

  return Array.from(tagSet).sort()
}

/**
 * Get all unique sections (top-level directories in wiki/)
 */
export function getAllSections(): string[] {
  if (!fs.existsSync(DOCS_DIR)) {
    return []
  }

  return fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort()
}
