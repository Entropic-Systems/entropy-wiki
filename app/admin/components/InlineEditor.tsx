'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface InlineEditorProps {
  value: string
  onSave: (value: string) => Promise<void> | void
  onCancel?: () => void
  placeholder?: string
  validate?: (value: string) => string | null // Returns error message or null if valid
  className?: string
  inputClassName?: string
  autoGenerate?: {
    enabled: boolean
    sourceValue: string
    generateFn: (source: string) => string
  }
}

export function InlineEditor({
  value,
  onSave,
  onCancel,
  placeholder = '',
  validate,
  className = '',
  inputClassName = '',
  autoGenerate,
}: InlineEditorProps) {
  const [editValue, setEditValue] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  // Update edit value if source value changes (for slug auto-generation)
  useEffect(() => {
    if (autoGenerate?.enabled && editValue === '') {
      setEditValue(autoGenerate.generateFn(autoGenerate.sourceValue))
    }
  }, [autoGenerate, editValue])

  const handleSave = useCallback(async () => {
    const trimmedValue = editValue.trim()

    // Validate
    if (validate) {
      const validationError = validate(trimmedValue)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    // Don't save if unchanged
    if (trimmedValue === value) {
      onCancel?.()
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSave(trimmedValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setIsSaving(false)
    }
  }, [editValue, value, validate, onSave, onCancel])

  const handleCancel = useCallback(() => {
    setEditValue(value)
    setError(null)
    onCancel?.()
  }, [value, onCancel])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    } else if (e.key === 'Tab' && autoGenerate?.enabled) {
      // Auto-generate value on Tab if enabled and field is empty
      if (editValue === '' || editValue === value) {
        e.preventDefault()
        const generated = autoGenerate.generateFn(autoGenerate.sourceValue)
        setEditValue(generated)
      }
    }
  }, [handleSave, handleCancel, autoGenerate, editValue, value])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
    setError(null) // Clear error on change
  }, [])

  const handleBlur = useCallback(() => {
    // Save on blur (unless there's an error)
    if (!error) {
      handleSave()
    }
  }, [error, handleSave])

  return (
    <div className={`inline-editor ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={isSaving}
          className={`
            w-full px-2 py-1 bg-background border rounded font-mono text-sm
            focus:outline-none focus:ring-2 focus:ring-cyan-500/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error
              ? 'border-red-500/60 focus:ring-red-500/50'
              : 'border-cyan-500/40'
            }
            ${inputClassName}
          `}
        />
        {isSaving && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 animate-spin text-cyan-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-1 text-xs text-red-400 font-mono">
          {error}
        </div>
      )}
      <div className="mt-1 text-xs text-cyan-500/50 font-mono">
        Enter to save, Escape to cancel
        {autoGenerate?.enabled && ', Tab to auto-generate'}
      </div>
    </div>
  )
}

// Title/Slug editor pair component for editing both fields together
interface TitleSlugEditorProps {
  title: string
  slug: string
  onSave: (title: string, slug: string) => Promise<void>
  onCancel: () => void
  validateTitle?: (title: string) => string | null
  validateSlug?: (slug: string) => string | null
}

export function TitleSlugEditor({
  title,
  slug,
  onSave,
  onCancel,
  validateTitle,
  validateSlug,
}: TitleSlugEditorProps) {
  const [editTitle, setEditTitle] = useState(title)
  const [editSlug, setEditSlug] = useState(slug)
  const [activeField, setActiveField] = useState<'title' | 'slug'>('title')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const slugInputRef = useRef<HTMLInputElement>(null)

  // Focus title input on mount
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [])

  // Generate slug from title
  const generateSlug = useCallback((titleValue: string): string => {
    return titleValue
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }, [])

  const handleSave = useCallback(async () => {
    const trimmedTitle = editTitle.trim()
    const trimmedSlug = editSlug.trim()

    // Validate title
    if (validateTitle) {
      const error = validateTitle(trimmedTitle)
      if (error) {
        setTitleError(error)
        setActiveField('title')
        titleInputRef.current?.focus()
        return
      }
    }

    // Validate slug
    if (validateSlug) {
      const error = validateSlug(trimmedSlug)
      if (error) {
        setSlugError(error)
        setActiveField('slug')
        slugInputRef.current?.focus()
        return
      }
    }

    // Don't save if nothing changed
    if (trimmedTitle === title && trimmedSlug === slug) {
      onCancel()
      return
    }

    setIsSaving(true)
    try {
      await onSave(trimmedTitle, trimmedSlug)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save'
      setTitleError(errorMsg)
      setIsSaving(false)
    }
  }, [editTitle, editSlug, title, slug, validateTitle, validateSlug, onSave, onCancel])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, field: 'title' | 'slug') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Tab' && field === 'title' && !e.shiftKey) {
      e.preventDefault()
      // Auto-generate slug if empty, then focus slug field
      if (editSlug === '' || editSlug === slug) {
        setEditSlug(generateSlug(editTitle))
      }
      setActiveField('slug')
      slugInputRef.current?.focus()
      slugInputRef.current?.select()
    } else if (e.key === 'Tab' && field === 'slug' && e.shiftKey) {
      e.preventDefault()
      setActiveField('title')
      titleInputRef.current?.focus()
    }
  }, [handleSave, onCancel, editSlug, slug, editTitle, generateSlug])

  return (
    <div className="title-slug-editor space-y-2 p-2 bg-background/90 border border-cyan-500/40 rounded-md shadow-lg">
      {/* Title Field */}
      <div>
        <label className="block text-xs font-mono text-cyan-500/70 mb-1">Title</label>
        <input
          ref={titleInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => { setEditTitle(e.target.value); setTitleError(null) }}
          onKeyDown={(e) => handleKeyDown(e, 'title')}
          onFocus={() => setActiveField('title')}
          disabled={isSaving}
          className={`
            w-full px-2 py-1 bg-background border rounded font-mono text-sm
            focus:outline-none focus:ring-2 focus:ring-cyan-500/50
            disabled:opacity-50
            ${titleError ? 'border-red-500/60' : 'border-cyan-500/40'}
          `}
        />
        {titleError && (
          <div className="mt-0.5 text-xs text-red-400 font-mono">{titleError}</div>
        )}
      </div>

      {/* Slug Field */}
      <div>
        <label className="block text-xs font-mono text-cyan-500/70 mb-1">Slug</label>
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50 font-mono text-sm">/</span>
          <input
            ref={slugInputRef}
            type="text"
            value={editSlug}
            onChange={(e) => { setEditSlug(e.target.value); setSlugError(null) }}
            onKeyDown={(e) => handleKeyDown(e, 'slug')}
            onFocus={() => setActiveField('slug')}
            disabled={isSaving}
            placeholder="auto-generated"
            className={`
              flex-1 px-2 py-1 bg-background border rounded font-mono text-sm
              focus:outline-none focus:ring-2 focus:ring-cyan-500/50
              disabled:opacity-50
              ${slugError ? 'border-red-500/60' : 'border-cyan-500/40'}
            `}
          />
          <button
            type="button"
            onClick={() => setEditSlug(generateSlug(editTitle))}
            disabled={isSaving}
            className="p-1 text-cyan-500/50 hover:text-cyan-400 transition-colors disabled:opacity-50"
            title="Generate from title"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        {slugError && (
          <div className="mt-0.5 text-xs text-red-400 font-mono">{slugError}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-cyan-500/20">
        <div className="text-xs text-cyan-500/50 font-mono">
          Tab to slug, Enter to save, Esc to cancel
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-2 py-1 text-xs font-mono text-cyan-500/70 hover:text-cyan-400 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-2 py-1 text-xs font-mono bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {isSaving && (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
