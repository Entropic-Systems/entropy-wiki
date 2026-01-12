'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import type { PageTreeNode } from '@/lib/api/types'

interface SortableTreeNodeProps {
  node: PageTreeNode
  depth?: number
  selectedIds: Set<string>
  onSelect: (id: string, event: React.MouseEvent) => void
  onPublish?: (id: string) => void
  onUnpublish?: (id: string, descendantCount?: number) => void
  onPublishSection?: (id: string, title: string) => void
  onUnpublishSection?: (id: string, title: string) => void
  onDelete?: (id: string, title: string) => void
  onUpdateTitle?: (id: string, title: string) => Promise<void>
}

export function SortableTreeNode({
  node,
  depth = 0,
  selectedIds,
  onSelect,
  onPublish,
  onUnpublish,
  onPublishSection,
  onUnpublishSection,
  onDelete,
  onUpdateTitle,
}: SortableTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(node.title)
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedIds.has(node.id)

  // Count all descendants recursively
  const countDescendants = (n: PageTreeNode): number => {
    if (!n.children || n.children.length === 0) return 0
    return n.children.length + n.children.reduce((acc, child) => acc + countDescendants(child), 0)
  }
  const descendantCount = countDescendants(node)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Reset edit value when node changes
  useEffect(() => {
    setEditValue(node.title)
  }, [node.title])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }, [hasChildren, isExpanded])

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, input')) {
      return
    }
    onSelect(node.id, e)
  }, [node.id, onSelect])

  // Double-click to enter edit mode
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onUpdateTitle) {
      setIsEditing(true)
      setEditError(null)
    }
  }, [onUpdateTitle])

  // Save title edit
  const handleSaveTitle = useCallback(async () => {
    const trimmedValue = editValue.trim()

    // Validation
    if (!trimmedValue) {
      setEditError('Title cannot be empty')
      return
    }

    // No change
    if (trimmedValue === node.title) {
      setIsEditing(false)
      return
    }

    if (!onUpdateTitle) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    setEditError(null)

    try {
      await onUpdateTitle(node.id, trimmedValue)
      setIsEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [editValue, node.id, node.title, onUpdateTitle])

  // Cancel title edit
  const handleCancelEdit = useCallback(() => {
    setEditValue(node.title)
    setEditError(null)
    setIsEditing(false)
  }, [node.title])

  // Handle keyboard events in edit input
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }, [handleSaveTitle, handleCancelEdit])

  // Handle blur on edit input
  const handleEditBlur = useCallback(() => {
    // Only save on blur if no error
    if (!editError) {
      handleSaveTitle()
    }
  }, [editError, handleSaveTitle])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing) return // Don't handle navigation while editing

    switch (e.key) {
      case ' ':
      case 'Enter':
        // Space/Enter to toggle selection
        e.preventDefault()
        onSelect(node.id, e as unknown as React.MouseEvent)
        break
      case 'ArrowRight':
        // Expand node
        if (hasChildren && !isExpanded) {
          e.preventDefault()
          setIsExpanded(true)
        }
        break
      case 'ArrowLeft':
        // Collapse node
        if (hasChildren && isExpanded) {
          e.preventDefault()
          setIsExpanded(false)
        }
        break
      case 'e':
        // 'e' to edit (if handler exists)
        if (onUpdateTitle && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          setIsEditing(true)
        }
        break
    }
  }, [isEditing, node.id, onSelect, hasChildren, isExpanded, onUpdateTitle])

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`tree-node-row group flex items-center py-1.5 px-2 rounded-md transition-colors cursor-pointer ${
          isSelected
            ? 'bg-cyan-500/20 border border-cyan-500/40'
            : 'hover:bg-cyan-500/10 border border-transparent'
        } ${isDragging ? 'shadow-lg ring-2 ring-cyan-500/50' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 8}px`, '--depth': depth } as React.CSSProperties}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        data-selected={isSelected}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="mr-2 cursor-grab active:cursor-grabbing text-cyan-500/40 hover:text-cyan-500/70"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>

        {/* Selection Checkbox */}
        <div
          className="mr-2 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); onSelect(node.id, e) }}
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

        {/* Page Title - Inline Editable */}
        {isEditing ? (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => { setEditValue(e.target.value); setEditError(null) }}
                onKeyDown={handleEditKeyDown}
                onBlur={handleEditBlur}
                disabled={isSaving}
                className={`
                  flex-1 px-2 py-0.5 bg-background border rounded font-mono text-sm
                  focus:outline-none focus:ring-2 focus:ring-cyan-500/50
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${editError ? 'border-red-500/60' : 'border-cyan-500/40'}
                `}
                onClick={(e) => e.stopPropagation()}
              />
              {isSaving && (
                <svg className="w-4 h-4 animate-spin text-cyan-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
            {editError && (
              <div className="text-xs text-red-400 font-mono mt-0.5">{editError}</div>
            )}
            <div className="text-xs text-cyan-500/50 font-mono mt-0.5">
              Enter to save, Escape to cancel
            </div>
          </div>
        ) : (
          <Link
            href={`/admin/edit/${node.id}`}
            className="flex-1 font-mono text-sm text-foreground hover:text-cyan-400 transition-colors truncate"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleDoubleClick}
            title="Double-click to edit title"
          >
            {node.title}
          </Link>
        )}

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

        {/* Actions */}
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
              onClick={(e) => { e.stopPropagation(); onUnpublish?.(node.id, descendantCount) }}
              className={`p-1 transition-colors flex items-center gap-0.5 ${
                hasChildren
                  ? 'text-orange-400/70 hover:text-orange-400'
                  : 'text-yellow-400/70 hover:text-yellow-400'
              }`}
              title={hasChildren
                ? `Unpublish page (will also unpublish ${descendantCount} child page${descendantCount !== 1 ? 's' : ''})`
                : 'Unpublish page'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              {/* Cascade warning indicator */}
              {hasChildren && (
                <span className="text-[9px] font-mono text-orange-400 bg-orange-500/20 px-1 rounded" title={`${descendantCount} children will also be unpublished`}>
                  +{descendantCount}
                </span>
              )}
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
        <div className="tree-node-children ml-4" role="group">
          {node.children.map((child) => (
            <SortableTreeNode
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
              onUpdateTitle={onUpdateTitle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
