import FlexSearch from 'flexsearch'
import { getAllDocs } from '../mdx/get-all-docs'
import type { SearchIndex, SearchResult } from './types'

/**
 * Build a search index from all documentation
 */
export function buildSearchIndex(): SearchIndex[] {
  const docs = getAllDocs()
  const searchIndex: SearchIndex[] = []

  for (const doc of docs) {
    // Extract category from slug (first segment)
    const category = doc.slug.split('/')[0]

    // Clean content for search (remove code blocks, links, etc.)
    const cleanContent = doc.content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
      .replace(/[#*_]/g, '') // Remove markdown symbols
      .replace(/\n+/g, ' ') // Normalize whitespace
      .trim()

    searchIndex.push({
      id: doc.slug,
      title: doc.frontMatter.title,
      content: cleanContent.slice(0, 1000), // Limit content length for performance
      url: `/${doc.slug}`,
      category,
    })
  }

  return searchIndex
}

/**
 * Create FlexSearch document index
 */
export function createFlexSearchIndex() {
  const index = new FlexSearch.Document({
    document: {
      id: 'id',
      index: ['title', 'content'],
      store: ['title', 'url', 'category'],
    },
    tokenize: 'forward',
    cache: 100,
  })

  const searchData = buildSearchIndex()

  for (const item of searchData) {
    index.add(item)
  }

  return { index, data: searchData }
}

/**
 * Export search index to JSON (for client-side search)
 */
export function exportSearchIndex(): string {
  const searchIndex = buildSearchIndex()
  return JSON.stringify(searchIndex)
}

/**
 * Get search data for pre-building
 */
export function getSearchData(): SearchIndex[] {
  return buildSearchIndex()
}
