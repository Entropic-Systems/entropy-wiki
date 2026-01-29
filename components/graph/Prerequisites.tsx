'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle, Circle, AlertTriangle, Info, BookOpen, GraduationCap } from 'lucide-react'

interface PrerequisitePage {
  pageSlug: string
  title: string
  depth: number
  strength: number
  confidence: number
  isRequired: boolean
}

interface PrerequisitesData {
  prerequisites: PrerequisitePage[]
  totalDepth: number
  requiredPrerequisites: string[]
  optionalPrerequisites: string[]
  missingPrerequisites: string[]
}

interface PrerequisitesProps {
  pageSlug: string
  className?: string
}

export function Prerequisites({ pageSlug, className = '' }: PrerequisitesProps) {
  const [prerequisites, setPrerequisites] = useState<PrerequisitesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchPrerequisites() {
      try {
        const response = await fetch(`/api/graph/pages/${pageSlug}/prerequisites`)

        if (!response.ok) {
          throw new Error(`Failed to fetch prerequisites: ${response.status}`)
        }

        const data = await response.json()
        if (data.success) {
          setPrerequisites({
            prerequisites: data.prerequisites || [],
            totalDepth: data.totalDepth || 0,
            requiredPrerequisites: data.requiredPrerequisites || [],
            optionalPrerequisites: data.optionalPrerequisites || [],
            missingPrerequisites: data.missingPrerequisites || [],
          })
        } else {
          throw new Error(data.message || 'Failed to fetch prerequisites')
        }
      } catch (err) {
        console.warn('Error fetching prerequisites:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    if (pageSlug) {
      fetchPrerequisites()
    }
  }, [pageSlug])

  const toggleCheck = (pageSlug: string) => {
    const newChecked = new Set(checkedItems)
    if (newChecked.has(pageSlug)) {
      newChecked.delete(pageSlug)
    } else {
      newChecked.add(pageSlug)
    }
    setCheckedItems(newChecked)
  }

  if (loading) {
    return (
      <div className={`border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4" />
          <h3 className="text-sm font-medium">Before Reading This</h3>
        </div>
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded flex-1"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return null
  }

  if (!prerequisites || prerequisites.prerequisites.length === 0) {
    return (
      <div className={`border rounded-lg p-4 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800 ${className}`}>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
            No Prerequisites Required
          </h3>
        </div>
        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
          You can start reading this topic directly.
        </p>
      </div>
    )
  }

  const requiredPrereqs = prerequisites.prerequisites.filter(p => p.isRequired)
  const optionalPrereqs = prerequisites.prerequisites.filter(p => !p.isRequired)
  const completionRate = checkedItems.size / prerequisites.prerequisites.length

  return (
    <div className={`border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Before Reading This
          </h3>
        </div>
        {prerequisites.prerequisites.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="text-xs text-blue-600 dark:text-blue-400">
              {checkedItems.size} / {prerequisites.prerequisites.length}
            </div>
            <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {prerequisites.prerequisites.length > 0 && (
        <div className="mb-4">
          <div className="w-full bg-blue-100 dark:bg-blue-900/50 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${completionRate * 100}%` }}
            />
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {Math.round(completionRate * 100)}% familiar
          </div>
        </div>
      )}

      {/* Required Prerequisites */}
      {requiredPrereqs.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-2">
            <AlertTriangle className="w-3 h-3 text-orange-600" />
            <h4 className="text-xs font-medium text-orange-800 dark:text-orange-200 uppercase tracking-wider">
              Required Knowledge
            </h4>
          </div>
          <ul className="space-y-2">
            {requiredPrereqs
              .sort((a, b) => a.depth - b.depth) // Show foundational concepts first
              .map((prereq) => (
                <li key={prereq.pageSlug} className="flex items-start gap-2 group">
                  <button
                    onClick={() => toggleCheck(prereq.pageSlug)}
                    className="mt-0.5 shrink-0"
                    title="Mark as familiar"
                  >
                    {checkedItems.has(prereq.pageSlug) ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground hover:text-green-600 transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${prereq.pageSlug}`}
                      className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-2"
                    >
                      {prereq.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full bg-orange-500"
                          style={{ opacity: prereq.confidence }}
                          title={`Confidence: ${(prereq.confidence * 100).toFixed(0)}%`}
                        />
                        <span className="text-xs text-muted-foreground">
                          Depth {prereq.depth}
                        </span>
                      </div>
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        Required
                      </span>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Optional Prerequisites */}
      {optionalPrereqs.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-2">
            <Info className="w-3 h-3 text-blue-600" />
            <h4 className="text-xs font-medium text-blue-800 dark:text-blue-200 uppercase tracking-wider">
              Helpful Background
            </h4>
          </div>
          <ul className="space-y-2">
            {optionalPrereqs
              .sort((a, b) => b.strength - a.strength) // Show strongest relationships first
              .slice(0, 3) // Limit to top 3 optional prerequisites
              .map((prereq) => (
                <li key={prereq.pageSlug} className="flex items-start gap-2 group">
                  <button
                    onClick={() => toggleCheck(prereq.pageSlug)}
                    className="mt-0.5 shrink-0"
                    title="Mark as familiar"
                  >
                    {checkedItems.has(prereq.pageSlug) ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground hover:text-green-600 transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${prereq.pageSlug}`}
                      className="text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-2"
                    >
                      {prereq.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full bg-blue-500"
                          style={{ opacity: prereq.strength }}
                          title={`Relevance: ${(prereq.strength * 100).toFixed(0)}%`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {(prereq.strength * 100).toFixed(0)}% relevant
                        </span>
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        Optional
                      </span>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Missing Prerequisites Warning */}
      {prerequisites.missingPrerequisites.length > 0 && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3 text-yellow-600" />
            <h4 className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
              Missing Content
            </h4>
          </div>
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Some referenced topics aren't available yet: {prerequisites.missingPrerequisites.join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}