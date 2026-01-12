'use client'

import { useState, useCallback, useMemo } from 'react'
import { TreeNode } from './TreeNode'
import { TreeControls } from './TreeControls'
import type { PageTreeNode } from '@/lib/api/types'

interface PageTreeProps {
  tree: PageTreeNode[]
  isLoading?: boolean
  onPublish?: (id: string) => void
  onUnpublish?: (id: string) => void
  onPublishSection?: (id: string, title: string) => void
  onUnpublishSection?: (id: string, title: string) => void
  onDelete?: (id: string, title: string) => void
  onBulkPublish?: (ids: string[]) => Promise<void>
  onBulkUnpublish?: (ids: string[]) => Promise<void>
  onBulkDelete?: (ids: string[]) => Promise<void>
  onRefresh?: () => void
}

export function PageTree({
  tree,
  isLoading = false,
  onPublish,
  onUnpublish,
  onPublishSection,
  onUnpublishSection,
  onDelete,
  onBulkPublish,
  onBulkUnpublish,
  onBulkDelete,
  onRefresh,
}: PageTreeProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  const [expandKey, setExpandKey] = useState(0)

  // Sort tree nodes: pages with children first, then leaf pages
  const sortedTree = useMemo(() => {
    const sortNodes = (nodes: PageTreeNode[]): PageTreeNode[] => {
      const sorted = [...nodes].sort((a, b) => {
        const aHasChildren = a.children && a.children.length > 0
        const bHasChildren = b.children && b.children.length > 0
        // Parent pages first
        if (aHasChildren && !bHasChildren) return -1
        if (!aHasChildren && bHasChildren) return 1
        // Then by sort_order
        return (a.sort_order || 0) - (b.sort_order || 0)
      })
      // Recursively sort children
      return sorted.map(node => ({
        ...node,
        children: node.children ? sortNodes(node.children) : []
      }))
    }
    return sortNodes(tree)
  }, [tree])

  // Flatten tree for shift-click range selection
  const flattenedIds = useMemo(() => {
    const flatten = (nodes: PageTreeNode[]): string[] => {
      return nodes.flatMap(node => [node.id, ...flatten(node.children || [])])
    }
    return flatten(sortedTree)
  }, [sortedTree])

  const handleSelect = useCallback((id: string, event: React.MouseEvent) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)

      if (event.shiftKey && lastSelectedId) {
        // Shift-click: select range
        const lastIndex = flattenedIds.indexOf(lastSelectedId)
        const currentIndex = flattenedIds.indexOf(id)
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex)
          const end = Math.max(lastIndex, currentIndex)
          for (let i = start; i <= end; i++) {
            newSet.add(flattenedIds[i])
          }
        }
      } else if (event.metaKey || event.ctrlKey) {
        // Cmd/Ctrl-click: toggle selection
        if (newSet.has(id)) {
          newSet.delete(id)
        } else {
          newSet.add(id)
        }
      } else {
        // Regular click: single select
        if (newSet.size === 1 && newSet.has(id)) {
          newSet.clear()
        } else {
          newSet.clear()
          newSet.add(id)
        }
      }

      return newSet
    })
    setLastSelectedId(id)
  }, [lastSelectedId, flattenedIds])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setLastSelectedId(null)
  }, [])

  const handleExpandAll = useCallback(() => {
    setExpandKey((k) => k + 1)
  }, [])

  const handleCollapseAll = useCallback(() => {
    setExpandKey((k) => k + 1)
  }, [])

  // Bulk action handlers
  const handleBulkPublish = useCallback(async () => {
    if (onBulkPublish && selectedIds.size > 0) {
      setIsBulkLoading(true)
      try {
        await onBulkPublish(Array.from(selectedIds))
        clearSelection()
      } finally {
        setIsBulkLoading(false)
      }
    }
  }, [onBulkPublish, selectedIds, clearSelection])

  const handleBulkUnpublish = useCallback(async () => {
    if (onBulkUnpublish && selectedIds.size > 0) {
      setIsBulkLoading(true)
      try {
        await onBulkUnpublish(Array.from(selectedIds))
        clearSelection()
      } finally {
        setIsBulkLoading(false)
      }
    }
  }, [onBulkUnpublish, selectedIds, clearSelection])

  const handleBulkDelete = useCallback(async () => {
    if (onBulkDelete && selectedIds.size > 0) {
      const count = selectedIds.size
      if (!confirm(`Are you sure you want to delete ${count} ${count === 1 ? 'page' : 'pages'}? This cannot be undone.`)) {
        return
      }
      setIsBulkLoading(true)
      try {
        await onBulkDelete(Array.from(selectedIds))
        clearSelection()
      } finally {
        setIsBulkLoading(false)
      }
    }
  }, [onBulkDelete, selectedIds, clearSelection])

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
    <div className="page-tree space-y-3">
      {/* Bulk Actions Toolbar */}
      <TreeControls
        selectedCount={selectedIds.size}
        onPublish={handleBulkPublish}
        onUnpublish={handleBulkUnpublish}
        onDelete={handleBulkDelete}
        onClearSelection={clearSelection}
        isLoading={isBulkLoading}
      />

      {/* Tree Container */}
      <div className="border border-cyan-500/20 rounded-lg bg-background/50 overflow-hidden">
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
          {sortedTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg className="w-12 h-12 text-cyan-500/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-mono text-sm text-muted-foreground">No pages yet</p>
              <p className="font-mono text-xs text-cyan-500/50 mt-1">Create your first page to get started</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {sortedTree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedIds={selectedIds}
                  onSelect={handleSelect}
                  onPublish={onPublish}
                  onUnpublish={onUnpublish}
                  onPublishSection={onPublishSection}
                  onUnpublishSection={onUnpublishSection}
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
            <span className="ml-auto text-cyan-500/30">
              Shift+click for range, Cmd/Ctrl+click for multi-select
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
