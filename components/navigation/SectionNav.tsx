"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

const SECTIONS = [
  { name: 'Beads', href: '/beads', description: 'Issue tracking & workflows' },
  { name: 'Gastown', href: '/gastown', description: 'Multi-agent orchestration' },
  { name: 'Skills Bank', href: '/skills-bank', description: 'Reusable capabilities' },
  { name: 'Prompt Bank', href: '/prompt-bank', description: 'High-performance prompts' },
  { name: 'Tooling & MCP', href: '/tooling-mcp', description: 'MCP servers & tools' },
  { name: 'Orchestration', href: '/orchestration', description: 'Multi-agent handoffs' },
]

export function SectionNav() {
  const pathname = usePathname()
  const currentSection = pathname?.split('/')[1]

  return (
    <nav className="border-b bg-muted/30">
      <div className="container">
        <div className="flex items-center space-x-1 overflow-x-auto py-2">
          {SECTIONS.map((section) => {
            const sectionSlug = section.href.slice(1)
            const isActive = currentSection === sectionSlug

            return (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  "flex flex-col px-3 py-2 rounded text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
                title={section.description}
              >
                <span>{section.name}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
