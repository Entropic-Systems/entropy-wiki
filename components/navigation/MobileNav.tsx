"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '../ui/button'

interface SectionItem {
  title: string
  href: string
}

interface MobileNavProps {
  sections?: SectionItem[]
}

// Default sections as fallback when API unavailable
const DEFAULT_SECTIONS: SectionItem[] = [
  { title: 'Beads', href: '/beads' },
  { title: 'Gastown', href: '/gastown' },
  { title: 'Skills Bank', href: '/skills-bank' },
  { title: 'Prompt Bank', href: '/prompt-bank' },
  { title: 'Plugins', href: '/plugins' },
  { title: 'Tooling & MCP', href: '/tooling-mcp' },
  { title: 'Orchestration', href: '/orchestration' },
]

/**
 * Mobile navigation - fetches sections dynamically from API
 */
export function MobileNav({ sections }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dynamicSections, setDynamicSections] = useState<SectionItem[]>(sections || DEFAULT_SECTIONS)

  // Fetch sections from API for dynamic navigation
  useEffect(() => {
    if (sections) {
      setDynamicSections(sections)
      return
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    fetch(`${apiUrl}/pages/nav`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.nav && Array.isArray(data.nav)) {
          // Only show top-level sections (pages with children or important pages)
          const topLevelSections = data.nav
            .filter((item: any) => item.items?.length > 0 || item.href === '/home')
            .map((item: any) => ({
              title: item.title,
              href: item.href,
            }))
          if (topLevelSections.length > 0) {
            setDynamicSections(topLevelSections)
          }
        }
      })
      .catch((err) => {
        console.error('Failed to fetch navigation:', err)
        // Keep using defaults on error
      })
  }, [sections])

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 w-9"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        aria-label="Toggle navigation menu"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        <span className="sr-only">Toggle menu</span>
      </Button>

      {isOpen && (
        <div
          id="mobile-menu"
          className="fixed inset-0 top-14 z-50 grid h-[calc(100vh-3.5rem)] grid-flow-row auto-rows-max overflow-auto bg-background p-6 shadow-md animate-in slide-in-from-bottom-80 md:hidden"
          role="dialog"
          aria-label="Mobile navigation"
        >
          <nav className="grid gap-4 text-sm font-medium" aria-label="Mobile sections">
            {dynamicSections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                onClick={() => setIsOpen(false)}
                className="hover:text-foreground/80"
              >
                {section.title}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
