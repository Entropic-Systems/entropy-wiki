"use client"

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui/button'
import type { SearchIndex, SearchResult } from '@/lib/search/types'

// Lazy load search functionality
let DocumentSearchClass: typeof import('@/lib/search/search').DocumentSearch | null = null

interface SearchDialogProps {
  searchData?: SearchIndex[]
}

export function SearchDialog({ searchData = [] }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchInstance, setSearchInstance] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // Lazy load and initialize search instance when dialog opens
  useEffect(() => {
    if (isOpen && searchData.length > 0 && !searchInstance) {
      setIsLoading(true)
      // Dynamically import search library only when needed
      import('@/lib/search/search').then((module) => {
        DocumentSearchClass = module.DocumentSearch
        setSearchInstance(new module.DocumentSearch(searchData))
        setIsLoading(false)
      })
    }
  }, [isOpen, searchData, searchInstance])

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen((open) => !open)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Perform search when query changes
  useEffect(() => {
    if (!searchInstance || !query.trim()) {
      setResults([])
      return
    }

    const searchResults = searchInstance.search(query, { limit: 10 })
    setResults(searchResults)
  }, [query, searchInstance])

  const handleResultClick = (url: string) => {
    setIsOpen(false)
    setQuery('')
    setResults([])
    router.push(url)
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setIsOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search documentation...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] border bg-background p-0 shadow-lg sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Search documentation..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Loading search...
                </div>
              ) : !query.trim() ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Start typing to search documentation...
                </div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No results found for "{query}"
                </div>
              ) : (
                <div className="py-2">
                  {results.map((result) => (
                    <button
                      key={result.id}
                      className="flex w-full flex-col gap-1 rounded-sm px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleResultClick(result.url)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground capitalize">
                          {result.category}
                        </span>
                        <span className="text-xs text-muted-foreground">›</span>
                        <span className="font-medium text-sm">{result.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {result.content.slice(0, 150)}...
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
