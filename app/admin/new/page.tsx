'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAdminContext } from '../context'
import { Button } from '@/components/ui/button'

export default function NewPage() {
  const router = useRouter()
  const { password } = useAdminContext()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Auto-generate slug from title
  function handleTitleChange(newTitle: string) {
    setTitle(newTitle)
    if (!slug || slug === titleToSlug(title)) {
      setSlug(titleToSlug(newTitle))
    }
  }

  function titleToSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  async function handleCreate() {
    if (!slug || !title || !content) {
      setError('Slug, title, and content are required')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const response = await fetch(`${apiUrl}/admin/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({
          slug,
          title,
          content_md: content,
          status,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to create page')
      }

      const data = await response.json()
      router.push(`/admin/edit/${data.page.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h2 className="text-2xl font-bold">New Page</h2>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded">
          {error}
        </div>
      )}

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium mb-2">URL Slug</label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">/</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="my-page-slug"
          />
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Page Title"
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium mb-2">Initial Status</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={status === 'draft'}
              onChange={() => setStatus('draft')}
              className="accent-primary"
            />
            <span>Draft</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={status === 'published'}
              onChange={() => setStatus('published')}
              className="accent-primary"
            />
            <span>Published</span>
          </label>
        </div>
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
            <h1>{title || 'Untitled'}</h1>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '*No content yet*'}
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

      {/* Create Button */}
      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={isSaving}>
          {isSaving ? 'Creating...' : 'Create Page'}
        </Button>
      </div>
    </div>
  )
}
