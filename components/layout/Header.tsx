"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '../ui/ThemeToggle'
import { MobileNav } from '../navigation/MobileNav'
import { SearchDialog } from '../search/SearchDialog'
import { siteConfig } from '@/config/site'
import type { SearchIndex } from '@/lib/search/types'

export function Header() {
  const [searchData, setSearchData] = useState<SearchIndex[]>([])

  useEffect(() => {
    // Load search index
    fetch('/search-index.json')
      .then((res) => res.json())
      .then((data) => setSearchData(data))
      .catch((err) => console.error('Failed to load search index:', err))
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex md:mr-6">
          <Link href="/" className="mr-6 flex items-center space-x-2" aria-label="Entropy Wiki home">
            <span className="font-bold text-xl" aria-hidden="true">⚡</span>
            <span className="hidden font-bold sm:inline-block">
              {siteConfig.name}
            </span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <SearchDialog searchData={searchData} />
          </div>

          <nav className="flex items-center space-x-2" aria-label="External links">
            <Link
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9"
              aria-label="View source on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span className="sr-only">GitHub</span>
            </Link>

            <ThemeToggle />

            <MobileNav />
          </nav>
        </div>
      </div>
    </header>
  )
}
