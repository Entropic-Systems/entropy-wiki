'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import type { PageTreeNode } from '@/lib/api/types'

interface TreeNodeProps {
  node: PageTreeNode
  depth?: number
  selectedIds: Set<string>
  onSelect: (id: string, event: React.MouseEvent) => void
  onPublish?: (id: string) => void
  onUnpublish?: (id: string) => void
  onPublishSection?: (id: string, title: string) => void
  onUnpublishSection?: (id: string, title: string) => void
  onDelete?: (id: string, title: string) => void
}

export function TreeNode({
  node,
  depth = 0,
  selectedIds,
  onSelect,
  onPublish,
  onUnpublish,
  onPublishSection,
  onUnpublishSection,
  onDelete,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedIds.has(node.id)

  // Count all descendants recursively
  const countDescendants = (n: PageTreeNode): number => {
    if (!n.children || n.children.length === 0) return 0
    return n.children.length + n.children.reduce((acc, child) => acc + countDescendants(child), 0)
  }
  const descendantCount = countDescendants(node)

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }, [hasChildren, isExpanded])

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    // Don't select if clicking on actions or link
    if ((e.target as HTMLElement).closest('a, button')) {
      return
    }
    onSelect(node.id, e)
  }, [node.id, onSelect])

  const handleCheckboxChange = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(node.id, e)
  }, [node.id, onSelect])

  return (
    <div className="tree-node">
      <div
        className={`tree-node-row group flex items-center py-1.5 px-2 rounded-md transition-colors cursor-pointer ${
          isSelected
            ? 'bg-cyan-500/20 border border-cyan-500/40'
            : 'hover:bg-cyan-500/10 border border-transparent'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={handleRowClick}
      >
        {/* Selection Checkbox */}
        <div
          className="mr-2 flex items-center justify-center"
          onClick={handleCheckboxChange}
        >
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-cyan-500 border-cyan-500'
                : 'border-cyan-500/40 hover:border-cyan-500'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3 text-background" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        {/* Expand/Collapse Toggle */}
        <button
          onClick={toggleExpand}
          className={`mr-2 w-5 h-5 flex items-center justify-center text-cyan-500/70 hover:text-cyan-400 transition-colors ${
            !hasChildren ? 'invisible' : ''
          }`}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Page Icon + Descendant Count */}
        <span className="mr-2 flex items-center gap-1">
          <span className="text-cyan-500/50">
            {hasChildren ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </span>
          {hasChildren && (
            <span className="text-[10px] font-mono text-cyan-500/60 bg-cyan-500/10 px-1 rounded" title={`${descendantCount} nested page${descendantCount !== 1 ? 's' : ''}`}>
              {descendantCount}
            </span>
          )}
        </span>

        {/* Page Title */}
        <Link
          href={`/admin/edit/${node.id}`}
          className="flex-1 font-mono text-sm text-foreground hover:text-cyan-400 transition-colors truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {node.title}
        </Link>

        {/* Status Badge */}
        <span
          className={`ml-2 px-1.5 py-0.5 rounded text-xs font-mono ${
            node.status === 'published'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
          }`}
        >
          {node.status === 'published' ? 'PUB' : 'DFT'}
        </span>

        {/* Actions (visible on hover) */}
        <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {/* Single page publish/unpublish */}
          {node.status === 'draft' ? (
            <button
              onClick={(e) => { e.stopPropagation(); onPublish?.(node.id) }}
              className="p-1 text-green-400/70 hover:text-green-400 transition-colors"
              title="Publish page"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onUnpublish?.(node.id) }}
              className="p-1 text-yellow-400/70 hover:text-yellow-400 transition-colors"
              title="Unpublish page"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </button>
          )}

          {/* Section publish/unpublish (only for nodes with children) */}
          {hasChildren && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onPublishSection?.(node.id, node.title) }}
                className="p-1 text-cyan-400/70 hover:text-cyan-400 transition-colors"
                title="Publish section (all children)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onUnpublishSection?.(node.id, node.title) }}
                className="p-1 text-orange-400/70 hover:text-orange-400 transition-colors"
                title="Unpublish section (all children)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM12 9v2m0 4h.01" />
                </svg>
              </button>
            </>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(node.id, node.title) }}
            className="p-1 text-red-400/70 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="tree-node-children border-l border-cyan-500/20 ml-4">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onSelect={onSelect}
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
  )
}
