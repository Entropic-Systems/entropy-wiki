'use client'

import { useState, useEffect, useCallback } from 'react'

interface AffectedPage {
  id: string
  title: string
  slug: string
  status: string
}

interface CascadeUnpublishDialogProps {
  isOpen: boolean
  pageId: string
  pageTitle: string
  descendantCount: number
  apiUrl: string
  password: string
  onConfirm: () => void
  onCancel: () => void
}

export function CascadeUnpublishDialog({
  isOpen,
  pageId,
  pageTitle,
  descendantCount,
  apiUrl,
  password,
  onConfirm,
  onCancel,
}: CascadeUnpublishDialogProps) {
  const [affectedPages, setAffectedPages] = useState<AffectedPage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch affected pages when dialog opens
  useEffect(() => {
    if (isOpen && descendantCount > 0) {
      setIsLoading(true)
      fetch(`${apiUrl}/admin/pages/${pageId}/descendants`, {
        headers: { 'X-Admin-Password': password },
      })
        .then(res => res.json())
        .then(data => {
          setAffectedPages(data.descendants || [])
        })
        .catch(err => {
          console.error('Failed to fetch descendants:', err)
          setAffectedPages([])
        })
        .finally(() => setIsLoading(false))
    } else {
      setAffectedPages([])
    }
  }, [isOpen, pageId, descendantCount, apiUrl, password])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const publishedCount = affectedPages.filter(p => p.status === 'published').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-background border border-orange-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-orange-500/20 bg-orange-500/10">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="font-mono text-sm font-medium text-orange-400">
              CASCADE UNPUBLISH WARNING
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-foreground">
            Unpublishing <strong className="text-cyan-400">&quot;{pageTitle}&quot;</strong> will also unpublish the following {descendantCount} child page{descendantCount !== 1 ? 's' : ''}:
          </p>

          {/* Affected Pages List */}
          <div className="max-h-48 overflow-auto border border-cyan-500/20 rounded bg-cyan-500/5">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <svg className="w-5 h-5 animate-spin text-cyan-500/70" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : (
              <ul className="divide-y divide-cyan-500/10">
                {affectedPages.map((page) => (
                  <li key={page.id} className="px-3 py-2 flex items-center gap-2">
                    <span className="text-cyan-500/50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    <span className="flex-1 font-mono text-sm truncate">{page.title}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        page.status === 'published'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {page.status === 'published' ? 'PUB' : 'DFT'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {publishedCount > 0 && (
            <p className="text-xs text-orange-400/80 font-mono">
              ⚠ {publishedCount} published page{publishedCount !== 1 ? 's' : ''} will be moved to draft
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-cyan-500/20 bg-cyan-500/5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-mono text-cyan-500/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm font-mono bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30 rounded transition-colors"
          >
            Unpublish All ({descendantCount + 1})
          </button>
        </div>
      </div>
    </div>
  )
}
