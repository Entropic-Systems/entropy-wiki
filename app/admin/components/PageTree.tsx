'use client'

import { useState, useCallback } from 'react'
import { TreeNode } from './TreeNode'
import type { PageTreeNode } from '@/lib/api/types'

interface PageTreeProps {
  tree: PageTreeNode[]
  isLoading?: boolean
  onPublish?: (id: string) => void
  onUnpublish?: (id: string) => void
  onDelete?: (id: string, title: string) => void
  onRefresh?: () => void
}

export function PageTree({
  tree,
  isLoading = false,
  onPublish,
  onUnpublish,
  onDelete,
  onRefresh,
}: PageTreeProps) {
  const [allExpanded, setAllExpanded] = useState(true)
  const [expandKey, setExpandKey] = useState(0)

  const handleExpandAll = useCallback(() => {
    setAllExpanded(true)
    setExpandKey((k) => k + 1)
  }, [])

  const handleCollapseAll = useCallback(() => {
    setAllExpanded(false)
    setExpandKey((k) => k + 1)
  }, [])

  // Count total pages recursively
  const countPages = (nodes: PageTreeNode[]): number => {
    return nodes.reduce((acc, node) => {
      return acc + 1 + (node.children ? countPages(node.children) : 0)
    }, 0)
  }

  const totalPages = countPages(tree)

  if (isLoading) {
    return (
      <div className="page-tree p-4 border border-cyan-500/20 rounded-lg bg-background/50">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-cyan-500/70">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-mono text-sm">Loading tree...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-tree border border-cyan-500/20 rounded-lg bg-background/50 overflow-hidden">
      {/* Tree Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-cyan-500/5">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm font-medium text-cyan-400">
            PAGE TREE
          </h3>
          <span className="font-mono text-xs text-cyan-500/50">
            {totalPages} {totalPages === 1 ? 'page' : 'pages'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExpandAll}
            className="px-2 py-1 text-xs font-mono text-cyan-500/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={handleCollapseAll}
            className="px-2 py-1 text-xs font-mono text-cyan-500/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
          >
            Collapse All
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-2 py-1 text-xs font-mono text-cyan-500/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-2 max-h-[600px] overflow-auto" key={expandKey}>
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-12 h-12 text-cyan-500/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-mono text-sm text-muted-foreground">No pages yet</p>
            <p className="font-mono text-xs text-cyan-500/50 mt-1">Create your first page to get started</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                onPublish={onPublish}
                onUnpublish={onUnpublish}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tree Footer - Legend */}
      <div className="px-4 py-2 border-t border-cyan-500/20 bg-cyan-500/5">
        <div className="flex items-center gap-4 text-xs font-mono text-cyan-500/50">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400/60"></span>
            Published
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400/60"></span>
            Draft
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400/60"></span>
            Public
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400/60"></span>
            Private
          </span>
          <span className="flex items-center gap-1">
            * = inherited
          </span>
        </div>
      </div>
    </div>
  )
}
