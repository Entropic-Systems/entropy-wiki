'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import type { PageTreeNode } from '@/lib/api/types'
import { VisibilityToggle } from './VisibilityToggle'

interface SortableTreeNodeProps {
  node: PageTreeNode
  depth?: number
  selectedIds: Set<string>
  onSelect: (id: string, event: React.MouseEvent) => void
  onPublish?: (id: string) => void
  onUnpublish?: (id: string) => void
  onDelete?: (id: string, title: string) => void
  onUpdateTitle?: (id: string, title: string) => Promise<void>
  onUpdateVisibility?: (id: string, visibility: 'public' | 'private') => Promise<void>
}

export function SortableTreeNode({
  node,
  depth = 0,
  selectedIds,
  onSelect,
  onPublish,
  onUnpublish,
  onDelete,
  onUpdateTitle,
  onUpdateVisibility,
}: SortableTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(node.title)
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedIds.has(node.id)

  // Count all descendants recursively for cascade confirmation
  const childCount = useMemo(() => {
    const countDescendants = (children: PageTreeNode[]): number => {
      return children.reduce((count, child) => {
        return count + 1 + countDescendants(child.children || [])
      }, 0)
    }
    return countDescendants(node.children || [])
  }, [node.children])

  // Handler for visibility toggle
  const handleVisibilityToggle = useCallback(async (newVisibility: 'public' | 'private') => {
    if (onUpdateVisibility) {
      await onUpdateVisibility(node.id, newVisibility)
    }
  }, [node.id, onUpdateVisibility])

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

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`group flex items-center py-1.5 px-2 rounded-md transition-colors cursor-pointer ${
          isSelected
            ? 'bg-cyan-500/20 border border-cyan-500/40'
            : 'hover:bg-cyan-500/10 border border-transparent'
        } ${isDragging ? 'shadow-lg ring-2 ring-cyan-500/50' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={handleRowClick}
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

        {/* Visibility Toggle */}
        <div className="ml-1.5">
          {onUpdateVisibility ? (
            <VisibilityToggle
              visibility={node.visibility}
              effectiveVisibility={node.effective_visibility}
              isInherited={node.inherited_visibility}
              hasChildren={hasChildren}
              childCount={childCount}
              onToggle={handleVisibilityToggle}
              size="sm"
            />
          ) : (
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                node.effective_visibility === 'private'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              }`}
            >
              {node.effective_visibility === 'private' ? 'PRIV' : 'PUB'}
              {node.inherited_visibility && <span className="ml-0.5 opacity-60">*</span>}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {node.status === 'draft' ? (
            <button
              onClick={(e) => { e.stopPropagation(); onPublish?.(node.id) }}
              className="p-1 text-green-400/70 hover:text-green-400 transition-colors"
              title="Publish"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onUnpublish?.(node.id) }}
              className="p-1 text-yellow-400/70 hover:text-yellow-400 transition-colors"
              title="Unpublish"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </button>
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
        <div className="border-l border-cyan-500/20 ml-4">
          {node.children.map((child) => (
            <SortableTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
              onDelete={onDelete}
              onUpdateTitle={onUpdateTitle}
              onUpdateVisibility={onUpdateVisibility}
            />
          ))}
        </div>
      )}
    </div>
  )
}
