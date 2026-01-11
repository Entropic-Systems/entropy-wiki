'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableTreeNode } from './SortableTreeNode'
import { TreeControls } from './TreeControls'
import type { PageTreeNode } from '@/lib/api/types'

interface DraggableTreeProps {
  tree: PageTreeNode[]
  isLoading?: boolean
  onPublish?: (id: string) => void
  onUnpublish?: (id: string) => void
  onDelete?: (id: string, title: string) => void
  onMove?: (id: string, parentId: string | null, sortOrder: number) => Promise<void>
  onReorder?: (pageIds: string[], parentId: string | null) => Promise<void>
  onBulkPublish?: (ids: string[]) => Promise<void>
  onBulkUnpublish?: (ids: string[]) => Promise<void>
  onBulkDelete?: (ids: string[]) => Promise<void>
  onBulkSetPublic?: (ids: string[]) => Promise<void>
  onBulkSetPrivate?: (ids: string[]) => Promise<void>
  onRefresh?: () => void
  onUpdateTitle?: (id: string, title: string) => Promise<void>
  onUpdateVisibility?: (id: string, visibility: 'public' | 'private') => Promise<void>
}

export function DraggableTree({
  tree,
  isLoading = false,
  onPublish,
  onUnpublish,
  onDelete,
  onMove,
  onReorder,
  onBulkPublish,
  onBulkUnpublish,
  onBulkDelete,
  onBulkSetPublic,
  onBulkSetPrivate,
  onRefresh,
  onUpdateTitle,
  onUpdateVisibility,
}: DraggableTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [isBulkLoading, setIsBulkLoading] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Flatten tree for operations
  const flattenTree = useCallback((nodes: PageTreeNode[]): PageTreeNode[] => {
    return nodes.flatMap(node => [node, ...flattenTree(node.children || [])])
  }, [])

  const flatNodes = flattenTree(tree)
  const flatIds = flatNodes.map(n => n.id)

  // Find a node by ID
  const findNode = useCallback((id: string): PageTreeNode | undefined => {
    return flatNodes.find(n => n.id === id)
  }, [flatNodes])

  // Get siblings of a node
  const getSiblings = useCallback((parentId: string | null): PageTreeNode[] => {
    if (parentId === null) {
      return tree
    }
    const parent = findNode(parentId)
    return parent?.children || []
  }, [tree, findNode])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Could add visual feedback here
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) {
      return
    }

    const activeNode = findNode(active.id as string)
    const overNode = findNode(over.id as string)

    if (!activeNode || !overNode) {
      return
    }

    // If same parent, reorder
    if (activeNode.parent_id === overNode.parent_id) {
      const siblings = getSiblings(activeNode.parent_id)
      const oldIndex = siblings.findIndex(n => n.id === activeNode.id)
      const newIndex = siblings.findIndex(n => n.id === overNode.id)

      if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
        const newOrder = [...siblings]
        newOrder.splice(oldIndex, 1)
        newOrder.splice(newIndex, 0, activeNode)
        await onReorder(newOrder.map(n => n.id), activeNode.parent_id)
      }
    } else if (onMove) {
      // Move to new parent
      const newSiblings = getSiblings(overNode.parent_id)
      const newIndex = newSiblings.findIndex(n => n.id === overNode.id)
      await onMove(activeNode.id, overNode.parent_id, newIndex)
    }
  }, [findNode, getSiblings, onReorder, onMove])

  // Selection handlers
  const handleSelect = useCallback((id: string, event: React.MouseEvent) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)

      if (event.shiftKey && lastSelectedId) {
        const lastIndex = flatIds.indexOf(lastSelectedId)
        const currentIndex = flatIds.indexOf(id)
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex)
          const end = Math.max(lastIndex, currentIndex)
          for (let i = start; i <= end; i++) {
            newSet.add(flatIds[i])
          }
        }
      } else if (event.metaKey || event.ctrlKey) {
        if (newSet.has(id)) {
          newSet.delete(id)
        } else {
          newSet.add(id)
        }
      } else {
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
  }, [lastSelectedId, flatIds])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setLastSelectedId(null)
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
      if (!confirm(`Delete ${count} ${count === 1 ? 'page' : 'pages'}? This cannot be undone.`)) {
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

  const handleBulkSetPublic = useCallback(async () => {
    if (onBulkSetPublic && selectedIds.size > 0) {
      setIsBulkLoading(true)
      try {
        await onBulkSetPublic(Array.from(selectedIds))
        clearSelection()
      } finally {
        setIsBulkLoading(false)
      }
    }
  }, [onBulkSetPublic, selectedIds, clearSelection])

  const handleBulkSetPrivate = useCallback(async () => {
    if (onBulkSetPrivate && selectedIds.size > 0) {
      setIsBulkLoading(true)
      try {
        await onBulkSetPrivate(Array.from(selectedIds))
        clearSelection()
      } finally {
        setIsBulkLoading(false)
      }
    }
  }, [onBulkSetPrivate, selectedIds, clearSelection])

  const activeNode = activeId ? findNode(activeId) : null
  const totalPages = flatNodes.length

  if (isLoading) {
    return (
      <div className="p-4 border border-cyan-500/20 rounded-lg bg-background/50">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-cyan-500/70">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="font-mono text-sm">Loading tree...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <TreeControls
        selectedCount={selectedIds.size}
        onPublish={handleBulkPublish}
        onUnpublish={handleBulkUnpublish}
        onDelete={handleBulkDelete}
        onSetPublic={handleBulkSetPublic}
        onSetPrivate={handleBulkSetPrivate}
        onClearSelection={clearSelection}
        isLoading={isBulkLoading}
      />

      <div className="border border-cyan-500/20 rounded-lg bg-background/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-cyan-500/5">
          <div className="flex items-center gap-3">
            <h3 className="font-mono text-sm font-medium text-cyan-400">PAGE TREE</h3>
            <span className="font-mono text-xs text-cyan-500/50">{totalPages} pages</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-2 py-1 text-xs font-mono text-cyan-500/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
            >
              Refresh
            </button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="p-2 max-h-[600px] overflow-auto">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="font-mono text-sm text-muted-foreground">No pages yet</p>
              </div>
            ) : (
              <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
                {tree.map((node) => (
                  <SortableTreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedIds={selectedIds}
                    onSelect={handleSelect}
                    onPublish={onPublish}
                    onUnpublish={onUnpublish}
                    onDelete={onDelete}
                    onUpdateTitle={onUpdateTitle}
                    onUpdateVisibility={onUpdateVisibility}
                  />
                ))}
              </SortableContext>
            )}
          </div>

          <DragOverlay>
            {activeNode && (
              <div className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/40 rounded-md font-mono text-sm shadow-lg">
                {activeNode.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <div className="px-4 py-2 border-t border-cyan-500/20 bg-cyan-500/5">
          <div className="flex items-center gap-4 text-xs font-mono text-cyan-500/50">
            <span>Drag to reorder</span>
            <span>Double-click title to edit</span>
            <span className="ml-auto">Shift+click for range, Cmd/Ctrl+click for multi-select</span>
          </div>
        </div>
      </div>
    </div>
  )
}
