import fs from 'fs'
import path from 'path'
import type { SidebarNavItem, NavigationData } from './types'

const DOCS_DIR = path.join(process.cwd(), 'wiki')

/**
 * Read and parse _meta.json file
 */
function readMetaFile(dir: string): NavigationData | null {
  const metaPath = path.join(dir, '_meta.json')

  if (!fs.existsSync(metaPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(metaPath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`Error parsing ${metaPath}:`, error)
    return null
  }
}

/**
 * Build navigation tree from _meta.json files recursively
 */
export function buildNavTree(dir: string = DOCS_DIR, basePath: string = ''): SidebarNavItem[] {
  const meta = readMetaFile(dir)
  const items: SidebarNavItem[] = []

  if (!meta) {
    // No _meta.json, use directory listing
    if (!fs.existsSync(dir)) {
      return items
    }

    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(entry => !entry.name.startsWith('.') && !entry.name.startsWith('_'))

    for (const entry of entries) {
      const title = entry.name
        .replace(/\.(md|mdx)$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())

      if (entry.isDirectory()) {
        const subPath = path.join(basePath, entry.name)
        const children = buildNavTree(path.join(dir, entry.name), subPath)

        items.push({
          title,
          href: `/${subPath}`,
          items: children,
        })
      } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
        const slug = entry.name.replace(/\.(md|mdx)$/, '')
        items.push({
          title,
          href: `/${path.join(basePath, slug)}`.replace(/\\/g, '/'),
          items: [],
        })
      }
    }

    return items
  }

  // Use _meta.json to build navigation
  for (const [key, value] of Object.entries(meta)) {
    // Skip special keys
    if (key.startsWith('_') || key.startsWith('*')) {
      continue
    }

    // Validate key to prevent path traversal
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      console.warn(`Skipping potentially malicious navigation key: ${key}`);
      continue
    }

    const itemPath = path.join(dir, key)
    const isDirectory = fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()
    const isFile = fs.existsSync(itemPath + '.md') || fs.existsSync(itemPath + '.mdx')

    // Skip items that don't exist as file or directory
    if (!isDirectory && !isFile) {
      continue
    }

    if (typeof value === 'string') {
      // Simple title mapping
      const href = isDirectory
        ? `/${path.join(basePath, key)}`.replace(/\\/g, '/')
        : `/${path.join(basePath, key)}`.replace(/\\/g, '/')

      if (isDirectory) {
        const subPath = path.join(basePath, key)
        const children = buildNavTree(path.join(dir, key), subPath)

        items.push({
          title: value,
          href,
          items: children,
        })
      } else {
        items.push({
          title: value,
          href,
          items: [],
        })
      }
    } else if (typeof value === 'object' && value !== null) {
      // Nested navigation data (shouldn't happen in our structure, but handle it)
      const href = `/${path.join(basePath, key)}`.replace(/\\/g, '/')
      items.push({
        title: key,
        href,
        items: [],
      })
    }
  }

  return items
}

/**
 * Build nav tree for a specific section
 */
export function buildSectionNavTree(section: string): SidebarNavItem[] {
  const sectionDir = path.join(DOCS_DIR, section)
  return buildNavTree(sectionDir, section)
}

/**
 * Get all sections with their nav trees
 */
export function getAllSectionNavTrees(): Record<string, SidebarNavItem[]> {
  if (!fs.existsSync(DOCS_DIR)) {
    return {}
  }

  const sections = fs
    .readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)

  const navTrees: Record<string, SidebarNavItem[]> = {}

  for (const section of sections) {
    navTrees[section] = buildSectionNavTree(section)
  }

  return navTrees
}

/**
 * Flatten nav tree to get all paths
 */
export function flattenNavTree(items: SidebarNavItem[]): string[] {
  const paths: string[] = []

  for (const item of items) {
    if (item.href) {
      paths.push(item.href)
    }
    if (item.items && item.items.length > 0) {
      paths.push(...flattenNavTree(item.items))
    }
  }

  return paths
}
