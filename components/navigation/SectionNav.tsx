"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import type { SidebarNavItem } from '@/lib/navigation/types'

interface SectionNavProps {
  sections: SidebarNavItem[]
}

/**
 * Dynamic section navigation - receives sections from server component
 */
export function SectionNav({ sections }: SectionNavProps) {
  const pathname = usePathname()
  const currentSection = pathname?.split('/')[1]

  if (!sections || sections.length === 0) {
    return null
  }

  return (
    <nav className="border-b bg-muted/30" aria-label="Main sections">
      <div className="container">
        <div
          className="flex flex-wrap items-center gap-1 py-2"
          role="list"
        >
          {sections.map((section) => {
            const sectionSlug = section.href?.slice(1) || ''
            const isActive = currentSection === sectionSlug

            return (
              <Link
                key={section.href}
                href={section.href || '#'}
                className={cn(
                  "flex flex-col px-3 py-2 rounded text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
                aria-current={isActive ? 'page' : undefined}
                role="listitem"
              >
                <span>{section.title}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
