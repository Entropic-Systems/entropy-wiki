'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, Book, GitBranch, Users, Zap } from 'lucide-react'

interface RelatedPage {
  pageSlug: string
  title: string
  category: string
  nodeType: 'concept' | 'tutorial' | 'reference' | 'example' | 'tool'
  relationshipType: 'prerequisite' | 'related' | 'extends' | 'contradicts' | 'supersedes' | 'references' | 'implements'
  strength: number
  confidence: number
  importanceScore: number
}

interface RelatedContentProps {
  pageSlug: string
  className?: string
}

const nodeTypeIcons = {
  concept: Book,
  tutorial: GitBranch,
  reference: ExternalLink,
  example: Zap,
  tool: Users,
}

const relationshipLabels = {
  prerequisite: 'Prerequisites',
  related: 'Related Topics',
  extends: 'Advanced Topics',
  contradicts: 'Alternative Views',
  supersedes: 'Updated By',
  references: 'References',
  implements: 'Implementations',
}

const relationshipColors = {
  prerequisite: 'text-blue-600 dark:text-blue-400',
  related: 'text-green-600 dark:text-green-400',
  extends: 'text-purple-600 dark:text-purple-400',
  contradicts: 'text-orange-600 dark:text-orange-400',
  supersedes: 'text-red-600 dark:text-red-400',
  references: 'text-gray-600 dark:text-gray-400',
  implements: 'text-indigo-600 dark:text-indigo-400',
}

export function RelatedContent({ pageSlug, className = '' }: RelatedContentProps) {
  const [relatedPages, setRelatedPages] = useState<RelatedPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRelatedContent() {
      try {
        const response = await fetch(`/api/graph/pages/${pageSlug}/related?limit=8`)

        if (!response.ok) {
          throw new Error(`Failed to fetch related content: ${response.status}`)
        }

        const data = await response.json()
        if (data.success) {
          setRelatedPages(data.relatedPages || [])
        } else {
          throw new Error(data.message || 'Failed to fetch related content')
        }
      } catch (err) {
        console.warn('Error fetching related content:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    if (pageSlug) {
      fetchRelatedContent()
    }
  }, [pageSlug])

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <h3 className="text-sm font-medium text-muted-foreground">Related Content</h3>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }

  if (error || relatedPages.length === 0) {
    return null
  }

  // Group pages by relationship type
  const groupedPages = relatedPages.reduce((acc, page) => {
    const type = page.relationshipType
    if (!acc[type]) {
      acc[type] = []
    }
    acc[type].push(page)
    return acc
  }, {} as Record<string, RelatedPage[]>)

  return (
    <div className={`space-y-6 ${className}`}>
      <h3 className="text-sm font-medium text-muted-foreground">Related Content</h3>

      {Object.entries(groupedPages)
        .sort(([a], [b]) => {
          // Sort by importance: prerequisites first, then related, then others
          const order = ['prerequisite', 'related', 'extends', 'implements', 'references', 'supersedes', 'contradicts']
          return order.indexOf(a) - order.indexOf(b)
        })
        .map(([relationshipType, pages]) => (
          <div key={relationshipType} className="space-y-2">
            <h4 className={`text-xs font-medium uppercase tracking-wider ${relationshipColors[relationshipType as keyof typeof relationshipColors]}`}>
              {relationshipLabels[relationshipType as keyof typeof relationshipLabels]}
            </h4>
            <ul className="space-y-2">
              {pages
                .sort((a, b) => b.strength - a.strength) // Sort by relationship strength
                .map((page) => {
                  const IconComponent = nodeTypeIcons[page.nodeType]
                  return (
                    <li key={page.pageSlug} className="group">
                      <Link
                        href={`/${page.pageSlug}`}
                        className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <IconComponent className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium group-hover:text-foreground transition-colors line-clamp-2">
                            {page.title}
                          </div>
                          {page.category && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {page.category}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: `hsl(${Math.round(page.strength * 120)}, 60%, 50%)`,
                                  opacity: 0.7
                                }}
                                title={`Relationship strength: ${(page.strength * 100).toFixed(0)}%`}
                              />
                              <span className="text-xs text-muted-foreground">
                                {(page.strength * 100).toFixed(0)}%
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground capitalize">
                              {page.nodeType}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
            </ul>
          </div>
        ))}
    </div>
  )
}