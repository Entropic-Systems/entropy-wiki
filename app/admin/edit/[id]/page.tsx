'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAdminContext } from '../../context'
import { Button } from '@/components/ui/button'
import type { PageWithContent } from '@/lib/api/types'

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default function EditPage({ params }: EditPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { password } = useAdminContext()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const [page, setPage] = useState<PageWithContent | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    fetchPage()
  }, [id])

  async function fetchPage() {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}`, {
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch page')
      }

      const data = await response.json()
      setPage(data.page)
      setTitle(data.page.title)
      setContent(data.page.content_md || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch page')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setError('')

    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({
          title,
          content_md: content,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save page')
      }

      // Refresh page data
      await fetchPage()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save page')
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublish() {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}/publish`, {
        method: 'POST',
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to publish page')
      }

      await fetchPage()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish page')
    }
  }

  async function handleUnpublish() {
    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}/unpublish`, {
        method: 'POST',
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to unpublish page')
      }

      await fetchPage()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unpublish page')
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this page? This cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`${apiUrl}/admin/pages/${id}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Password': password,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete page')
      }

      router.push('/admin')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete page')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading page...</div>
      </div>
    )
  }

  if (error && !page) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">{error}</div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">Page not found</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <div>
            <h2 className="text-2xl font-bold">Edit Page</h2>
            <p className="text-muted-foreground font-mono text-sm">/{page.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              page.status === 'published'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}
          >
            {page.status}
          </span>
          {page.status === 'draft' ? (
            <Button onClick={handlePublish} size="sm">
              Publish
            </Button>
          ) : (
            <Button variant="outline" onClick={handleUnpublish} size="sm">
              Unpublish
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete} size="sm">
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Toggle Preview */}
      <div className="flex items-center gap-4">
        <Button
          variant={showPreview ? 'outline' : 'default'}
          size="sm"
          onClick={() => setShowPreview(false)}
        >
          Edit
        </Button>
        <Button
          variant={showPreview ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowPreview(true)}
        >
          Preview
        </Button>
      </div>

      {/* Editor / Preview */}
      <div className="border rounded-lg overflow-hidden min-h-[500px]">
        {showPreview ? (
          <div className="p-6 prose prose-slate dark:prose-invert max-w-none">
            <h1>{title}</h1>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-[500px] p-4 bg-background font-mono text-sm resize-none focus:outline-none"
            placeholder="Write your markdown content here..."
          />
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
