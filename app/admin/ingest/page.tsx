'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminContext } from '../context'
import { Button } from '@/components/ui/button'

interface IngestJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  mode: 'manual' | 'scheduled' | 'api'
  total_items: number
  processed_items: number
  failed_items: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

type IngestMode = 'automatic' | 'review'
type SourceType = 'url' | 'text'

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

export default function IngestPage() {
  const { password } = useAdminContext()
  const [jobs, setJobs] = useState<IngestJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [sourceType, setSourceType] = useState<SourceType>('url')
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [mode, setMode] = useState<IngestMode>('automatic')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  useEffect(() => {
    fetchJobs()
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [password])

  async function fetchJobs() {
    try {
      const response = await fetch(`${apiUrl}/admin/ingest/jobs?limit=20`, {
        headers: {
          'X-Admin-Password': password,
        },
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch jobs')
      }

      const data = await response.json()
      setJobs(data.jobs)
    } catch (err) {
      if (!jobs.length) {
        setError(err instanceof Error ? err.message : 'Failed to fetch jobs')
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsSubmitting(true)

    try {
      let items;

      if (sourceType === 'url') {
        const urls = urlInput.split('\n').filter(u => u.trim()).map(u => u.trim());

        // Validate URLs on frontend
        const invalidUrls = urls.filter(url => {
          try {
            new URL(url);
            return false;
          } catch {
            return true;
          }
        });

        if (invalidUrls.length > 0) {
          throw new Error(`Invalid URL(s): ${invalidUrls.slice(0, 3).join(', ')}${invalidUrls.length > 3 ? ` and ${invalidUrls.length - 3} more` : ''}`);
        }

        items = urls.map(url => ({
          source_type: 'url' as const,
          url,
        }));
      } else {
        // Validate text content
        if (!textInput.trim()) {
          throw new Error('Content cannot be empty or only whitespace');
        }

        // Check content length (max 1MB)
        if (textInput.length > 1024 * 1024) {
          throw new Error(`Content too large: ${(textInput.length / 1024).toFixed(1)}KB. Maximum allowed is 1MB.`);
        }

        items = [{
          source_type: 'text' as const,
          content: textInput.trim(),
        }];
      }

      if (items.length === 0) {
        throw new Error('Please provide at least one URL or some text content')
      }

      const response = await fetch(`${apiUrl}/admin/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': password,
        },
        body: JSON.stringify({
          items,
          mode: 'api',
          metadata: {
            review_mode: mode === 'review' ? 'true' : 'false',
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to submit ingest job')
      }

      const data = await response.json()
      setSuccess(`Created job with ${items.length} item(s)`)
      setUrlInput('')
      setTextInput('')
      fetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit ingest job')
    } finally {
      setIsSubmitting(false)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

  function getProgress(job: IngestJob) {
    if (job.total_items === 0) return 0
    return Math.round((job.processed_items / job.total_items) * 100)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Content Ingestion</h2>
        <p className="text-muted-foreground">
          Submit URLs or text content to be automatically extracted and integrated into the wiki.
        </p>
      </div>

      {/* Ingest Form */}
      <form onSubmit={handleSubmit} className="space-y-6 border rounded-lg p-6 bg-card">
        <div className="space-y-4">
          {/* Source Type Toggle */}
          <div>
            <label className="block text-sm font-medium mb-2">Source Type</label>
            <div className="flex items-center border rounded-lg overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setSourceType('url')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  sourceType === 'url'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                URL(s)
              </button>
              <button
                type="button"
                onClick={() => setSourceType('text')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  sourceType === 'text'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                Raw Text
              </button>
            </div>
          </div>

          {/* URL Input */}
          {sourceType === 'url' && (
            <div>
              <label htmlFor="urls" className="block text-sm font-medium mb-2">
                URLs (one per line)
              </label>
              <textarea
                id="urls"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/article&#10;https://github.com/owner/repo&#10;..."
                className="w-full h-32 px-3 py-2 border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports articles, GitHub repos/issues, and Twitter/X links.
              </p>
            </div>
          )}

          {/* Text Input */}
          {sourceType === 'text' && (
            <div>
              <label htmlFor="content" className="block text-sm font-medium mb-2">
                Content
              </label>
              <textarea
                id="content"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste or type your content here. The first line may be used as the title if it looks like a heading."
                className="w-full h-48 px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Mode Toggle */}
          <div>
            <label className="block text-sm font-medium mb-2">Processing Mode</label>
            <div className="flex items-center border rounded-lg overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setMode('automatic')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'automatic'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                Automatic
              </button>
              <button
                type="button"
                onClick={() => setMode('review')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'review'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                Review First
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'automatic'
                ? 'Content will be processed and published automatically.'
                : 'Content will pause for review before being published.'}
            </p>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-lg text-sm">
            {success}
          </div>
        )}

        {/* Submit */}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit for Ingestion'}
        </Button>
      </form>

      {/* Recent Jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Jobs</h3>
          <Button variant="outline" size="sm" onClick={fetchJobs}>
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground text-center py-8">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="text-muted-foreground text-center py-8 border rounded-lg">
            No jobs yet. Submit some content to get started.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Progress</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-left px-4 py-3 font-medium">Completed</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[job.status]}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${getProgress(job)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {job.processed_items}/{job.total_items}
                          {job.failed_items > 0 && (
                            <span className="text-destructive ml-1">
                              ({job.failed_items} failed)
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(job.completed_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/ingest/jobs/${job.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
