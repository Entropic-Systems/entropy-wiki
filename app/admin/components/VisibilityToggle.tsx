'use client'

import { useState, useCallback } from 'react'

type Visibility = 'public' | 'private'

interface VisibilityToggleProps {
  visibility: Visibility
  effectiveVisibility: Visibility
  isInherited: boolean
  hasChildren?: boolean
  childCount?: number
  onToggle: (newVisibility: Visibility) => Promise<void>
  size?: 'sm' | 'md'
  showLabel?: boolean
}

export function VisibilityToggle({
  visibility,
  effectiveVisibility,
  isInherited,
  hasChildren = false,
  childCount = 0,
  onToggle,
  size = 'sm',
  showLabel = false,
}: VisibilityToggleProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showCascadeModal, setShowCascadeModal] = useState(false)
  const [pendingVisibility, setPendingVisibility] = useState<Visibility | null>(null)

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const buttonPadding = size === 'sm' ? 'p-1' : 'p-1.5'

  // Determine if this is showing inherited state (different from own visibility)
  const showingInherited = isInherited && effectiveVisibility !== visibility

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    const newVisibility = effectiveVisibility === 'public' ? 'private' : 'public'

    // If has children and toggling to private, show confirmation
    if (hasChildren && newVisibility === 'private') {
      setPendingVisibility(newVisibility)
      setShowCascadeModal(true)
      return
    }

    setIsLoading(true)
    try {
      await onToggle(newVisibility)
    } catch (err) {
      console.error('Failed to toggle visibility:', err)
    } finally {
      setIsLoading(false)
    }
  }, [effectiveVisibility, hasChildren, onToggle])

  const handleConfirmCascade = useCallback(async () => {
    if (!pendingVisibility) return

    setShowCascadeModal(false)
    setIsLoading(true)
    try {
      await onToggle(pendingVisibility)
    } catch (err) {
      console.error('Failed to toggle visibility:', err)
    } finally {
      setIsLoading(false)
      setPendingVisibility(null)
    }
  }, [pendingVisibility, onToggle])

  const handleCancelCascade = useCallback(() => {
    setShowCascadeModal(false)
    setPendingVisibility(null)
  }, [])

  // Get the display state
  const getDisplayState = () => {
    if (showingInherited) {
      return {
        icon: 'inherited',
        color: effectiveVisibility === 'private' ? 'text-amber-400/70' : 'text-amber-400/70',
        bgColor: 'bg-amber-500/10 hover:bg-amber-500/20',
        borderColor: 'border-amber-500/30',
        label: effectiveVisibility === 'private' ? 'Private (inherited)' : 'Public (inherited)',
        title: `Visibility inherited from parent. Own setting: ${visibility}`,
      }
    }

    if (effectiveVisibility === 'private') {
      return {
        icon: 'private',
        color: 'text-red-400/70 hover:text-red-400',
        bgColor: 'bg-red-500/10 hover:bg-red-500/20',
        borderColor: 'border-red-500/30',
        label: 'Private',
        title: 'Private - Only visible to admins',
      }
    }

    return {
      icon: 'public',
      color: 'text-cyan-400/70 hover:text-cyan-400',
      bgColor: 'bg-cyan-500/10 hover:bg-cyan-500/20',
      borderColor: 'border-cyan-500/30',
      label: 'Public',
      title: 'Public - Visible to everyone',
    }
  }

  const state = getDisplayState()

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`
          ${buttonPadding} rounded transition-all flex items-center gap-1
          ${state.bgColor} ${state.color}
          border ${state.borderColor}
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        title={state.title}
      >
        {isLoading ? (
          <svg className={`${iconSize} animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : state.icon === 'inherited' ? (
          // Chain/link icon for inherited
          <div className="relative">
            {effectiveVisibility === 'private' ? (
              <EyeOffIcon className={iconSize} />
            ) : (
              <EyeIcon className={iconSize} />
            )}
            <ChainIcon className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 text-amber-400" />
          </div>
        ) : state.icon === 'private' ? (
          <EyeOffIcon className={iconSize} />
        ) : (
          <EyeIcon className={iconSize} />
        )}
        {showLabel && (
          <span className="text-xs font-mono">{state.label}</span>
        )}
      </button>

      {/* Cascade Confirmation Modal */}
      {showCascadeModal && (
        <CascadeModal
          childCount={childCount}
          onConfirm={handleConfirmCascade}
          onCancel={handleCancelCascade}
        />
      )}
    </>
  )
}

// Eye icon for public
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

// Eye-off icon for private
function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

// Chain/link icon for inherited
function ChainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
    </svg>
  )
}

// Cascade confirmation modal
interface CascadeModalProps {
  childCount: number
  onConfirm: () => void
  onCancel: () => void
}

function CascadeModal({ childCount, onConfirm, onCancel }: CascadeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-background border border-cyan-500/30 rounded-lg shadow-xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full bg-amber-500/20">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-mono text-lg font-medium text-foreground">
                Cascade Visibility?
              </h3>
              <p className="text-sm text-muted-foreground">
                This action affects child pages
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-sm text-foreground">
              Setting this page to <span className="font-semibold text-red-400">private</span> will
              also make{' '}
              <span className="font-semibold text-cyan-400">
                {childCount} child {childCount === 1 ? 'page' : 'pages'}
              </span>{' '}
              effectively private through inheritance.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Children will inherit the private visibility unless explicitly set to public.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-mono bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded transition-colors"
            >
              Set Private
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact visibility badge for display-only use
interface VisibilityBadgeProps {
  effectiveVisibility: Visibility
  isInherited: boolean
  size?: 'sm' | 'md'
}

export function VisibilityBadge({
  effectiveVisibility,
  isInherited,
  size = 'sm',
}: VisibilityBadgeProps) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  if (effectiveVisibility === 'private') {
    return (
      <span
        className={`px-1.5 py-0.5 rounded ${textSize} font-mono bg-red-500/20 text-red-400 border border-red-500/30`}
        title={isInherited ? 'Private (inherited from parent)' : 'Private'}
      >
        PRIV
        {isInherited && <span className="ml-0.5 opacity-60">*</span>}
      </span>
    )
  }

  return (
    <span
      className={`px-1.5 py-0.5 rounded ${textSize} font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/30`}
      title={isInherited ? 'Public (inherited)' : 'Public'}
    >
      PUB
      {isInherited && <span className="ml-0.5 opacity-60">*</span>}
    </span>
  )
}
