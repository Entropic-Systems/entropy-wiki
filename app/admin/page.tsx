'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminContext } from './context'
import { Button } from '@/components/ui/button'
import type { Page } from '@/lib/api/types'

export default function AdminDashboard() {
  const { password } = useAdminContext()
  const [pages, setPages] = useState<Page[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  useEffect(() => {
    fetchPages()
  }, [password])

  async function fetchPages() {
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

      fetchPages()
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

      fetchPages()
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

      fetchPages()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete page')
    }
  }

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
            Manage all wiki pages ({pages.length} total)
          </p>
        </div>
        <Link href="/admin/new">
          <Button>+ New Page</Button>
        </Link>
      </div>

      {/* Pages Table */}
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
    </div>
  )
}
