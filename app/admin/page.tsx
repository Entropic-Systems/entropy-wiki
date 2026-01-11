'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminContext } from './context'
import { Button } from '@/components/ui/button'
import { DraggableTree } from './components/DraggableTree'
import type { Page, PageTreeNode } from '@/lib/api/types'

type ViewMode = 'list' | 'tree'

export default function AdminDashboard() {
  const { password } = useAdminContext()
  const [pages, setPages] = useState<Page[]>([])
  const [tree, setTree] = useState<PageTreeNode[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  useEffect(() => {
    if (viewMode === 'tree') {
      fetchTree()
    } else {
      fetchPages()
    }
  }, [password, viewMode])

  async function fetchPages() {
    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/admin/pages`, {
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch pages')
      }

      const data = await response.json()
      setPages(data.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pages')
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchTree() {
    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/admin/pages/tree`, {
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch page tree')
      }

      const data = await response.json()
      setTree(data.tree)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch page tree')
    } finally {
      setIsLoading(false)
    }
  }

  async function handlePublish(pageId: string) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/${pageId}/publish`, {
        method: 'POST',
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to publish page')
      }

      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish page')
    }
  }

  async function handleUnpublish(pageId: string) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/${pageId}/unpublish`, {
        method: 'POST',
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to unpublish page')
      }

      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unpublish page')
    }
  }

  async function handleDelete(pageId: string, pageTitle: string) {
    if (!confirm(`Are you sure you want to delete "${pageTitle}"? This cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`${apiUrl}/admin/pages/${pageId}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete page')
      }

      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete page')
    }
  }

  function refreshData() {
    if (viewMode === 'tree') {
      fetchTree()
    } else {
      fetchPages()
    }
  }

  // Bulk action handlers
  async function handleBulkPublish(ids: string[]) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ page_ids: ids, action: 'publish' }),
      })
      if (!response.ok) throw new Error('Failed to bulk publish')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to bulk publish')
    }
  }

  async function handleBulkUnpublish(ids: string[]) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ page_ids: ids, action: 'unpublish' }),
      })
      if (!response.ok) throw new Error('Failed to bulk unpublish')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to bulk unpublish')
    }
  }

  async function handleBulkDelete(ids: string[]) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ page_ids: ids, action: 'delete' }),
      })
      if (!response.ok) throw new Error('Failed to bulk delete')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to bulk delete')
    }
  }

  async function handleBulkSetPublic(ids: string[]) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ page_ids: ids, action: 'set_public' }),
      })
      if (!response.ok) throw new Error('Failed to set pages public')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to set pages public')
    }
  }

  async function handleBulkSetPrivate(ids: string[]) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ page_ids: ids, action: 'set_private' }),
      })
      if (!response.ok) throw new Error('Failed to set pages private')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to set pages private')
    }
  }

  // Move page to new parent
  async function handleMove(id: string, parentId: string | null, sortOrder: number) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ parent_id: parentId, sort_order: sortOrder }),
      })
      if (!response.ok) throw new Error('Failed to move page')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to move page')
    }
  }

  // Reorder pages within parent
  async function handleReorder(pageIds: string[], parentId: string | null) {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({ page_ids: pageIds, parent_id: parentId }),
      })
      if (!response.ok) throw new Error('Failed to reorder pages')
      refreshData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reorder pages')
    }
  }

  // Update page title inline
  async function handleUpdateTitle(pageId: string, title: string) {
    const response = await fetch(`${apiUrl}/admin/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': password,
      },
      body: JSON.stringify({ title }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update title' }))
      throw new Error(error.message || 'Failed to update title')
    }
    refreshData()
  }

  // Count total pages in tree
  const countTreePages = (nodes: PageTreeNode[]): number => {
    return nodes.reduce((acc, node) => {
      return acc + 1 + (node.children ? countTreePages(node.children) : 0)
    }, 0)
  }

  const totalPages = viewMode === 'tree' ? countTreePages(tree) : pages.length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading pages...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pages</h2>
          <p className="text-muted-foreground">
            Manage all wiki pages ({totalPages} total)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'tree'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              List
            </button>
          </div>
          <Link href="/admin/new">
            <Button>+ New Page</Button>
          </Link>
        </div>
      </div>

      {/* Tree View */}
      {viewMode === 'tree' && (
        <DraggableTree
          tree={tree}
          isLoading={isLoading}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
          onDelete={handleDelete}
          onMove={handleMove}
          onReorder={handleReorder}
          onBulkPublish={handleBulkPublish}
          onBulkUnpublish={handleBulkUnpublish}
          onBulkDelete={handleBulkDelete}
          onBulkSetPublic={handleBulkSetPublic}
          onBulkSetPrivate={handleBulkSetPrivate}
          onRefresh={refreshData}
          onUpdateTitle={handleUpdateTitle}
        />
      )}

      {/* List View - Pages Table */}
      {viewMode === 'list' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Visibility</th>
                <th className="text-left px-4 py-3 font-medium">Updated</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/edit/${page.id}`}
                      className="font-medium hover:underline"
                    >
                      {page.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-sm">
                    /{page.slug}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        page.status === 'published'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      }`}
                    >
                      {page.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        page.visibility === 'public'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {page.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">
                    {new Date(page.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {page.status === 'draft' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePublish(page.id)}
                      >
                        Publish
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnpublish(page.id)}
                      >
                        Unpublish
                      </Button>
                    )}
                    <Link href={`/admin/edit/${page.id}`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(page.id, page.title)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}

              {pages.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No pages yet. Create your first page to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
