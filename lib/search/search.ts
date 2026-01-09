import FlexSearch from 'flexsearch'
import type { SearchIndex, SearchResult, SearchOptions } from './types'

/**
 * Client-side search using FlexSearch
 */
export class DocumentSearch {
  private index: any
  private data: SearchIndex[]

  constructor(searchData: SearchIndex[]) {
    this.data = searchData
    this.index = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['title', 'content'],
        store: ['title', 'url', 'category'],
      },
      tokenize: 'forward',
      cache: 100,
    })

    // Add all data to index
    for (const item of searchData) {
      this.index.add(item)
    }
  }

  /**
   * Search for documents
   */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const { limit = 10 } = options

    if (!query || query.trim().length === 0) {
      return []
    }

    const results = this.index.search(query, {
      limit,
      enrich: true,
    })

    const searchResults: SearchResult[] = []
    const seen = new Set<string>()

    // FlexSearch returns results grouped by field
    for (const fieldResult of results) {
      if (!fieldResult.result) continue

      for (const item of fieldResult.result) {
        const doc = item.doc as SearchIndex

        if (seen.has(doc.id)) continue
        seen.add(doc.id)

        searchResults.push({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          url: doc.url,
          category: doc.category,
          breadcrumbs: doc.id.split('/'),
        })

        if (searchResults.length >= limit) break
      }

      if (searchResults.length >= limit) break
    }

    return searchResults
  }

  /**
   * Get all documents (for debugging)
   */
  getAllDocuments(): SearchIndex[] {
    return this.data
  }
}

/**
 * Create a search instance from pre-built index data
 */
export function createSearchInstance(searchData: SearchIndex[]): DocumentSearch {
  return new DocumentSearch(searchData)
}
