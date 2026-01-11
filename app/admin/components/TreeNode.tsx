'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PageTreeNode } from '@/lib/api/types'

interface TreeNodeProps {
  node: PageTreeNode
  depth?: number
  onPublish?: (id: string) => void
  onUnpublish?: (id: string) => void
  onDelete?: (id: string, title: string) => void
}

export function TreeNode({
  node,
  depth = 0,
  onPublish,
  onUnpublish,
  onDelete,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0

  const toggleExpand = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className="tree-node">
      <div
        className="tree-node-row group flex items-center py-1.5 px-2 rounded-md hover:bg-cyan-500/10 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
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

        {/* Page Icon */}
        <span className="mr-2 text-cyan-500/50">
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

        {/* Page Title */}
        <Link
          href={`/admin/edit/${node.id}`}
          className="flex-1 font-mono text-sm text-foreground hover:text-cyan-400 transition-colors truncate"
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

        {/* Visibility Badge */}
        <span
          className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-mono ${
            node.effective_visibility === 'private'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
          }`}
        >
          {node.effective_visibility === 'private' ? 'PRIV' : 'PUB'}
          {node.inherited_visibility && (
            <span className="ml-0.5 opacity-60" title="Inherited from parent">*</span>
          )}
        </span>

        {/* Actions (visible on hover) */}
        <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {node.status === 'draft' ? (
            <button
              onClick={() => onPublish?.(node.id)}
              className="p-1 text-green-400/70 hover:text-green-400 transition-colors"
              title="Publish"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => onUnpublish?.(node.id)}
              className="p-1 text-yellow-400/70 hover:text-yellow-400 transition-colors"
              title="Unpublish"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete?.(node.id, node.title)}
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
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
