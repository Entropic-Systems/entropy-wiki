'use client'

import { useState, useEffect, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AdminContext } from './context'

interface AdminLayoutProps {
  children: ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [password, setPassword] = useState('')
  const [inputPassword, setInputPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // Check for stored password on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('admin_password')
    if (stored) {
      setPassword(stored)
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Verify password by trying to fetch admin pages
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/admin/pages`, {
        headers: {
          'X-Admin-Password': inputPassword,
        },
      })

      if (response.ok) {
        setPassword(inputPassword)
        setIsAuthenticated(true)
        sessionStorage.setItem('admin_password', inputPassword)
      } else if (response.status === 401) {
        setError('Invalid password')
      } else {
        setError('Failed to connect to API')
      }
    } catch (err) {
      setError('Failed to connect to API. Is the server running?')
    }
  }

  const logout = () => {
    setPassword('')
    setIsAuthenticated(false)
    sessionStorage.removeItem('admin_password')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 space-y-6 mx-4">
          {/* Login Card with cyber styling */}
          <div className="bg-card border border-cyan-500/20 rounded-lg p-6 shadow-lg">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold font-mono text-cyan-400">Admin Login</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Enter your admin password to continue
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 admin-login-form">
              <div>
                <input
                  type="password"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  placeholder="Admin password"
                  className="w-full px-4 py-3 border border-cyan-500/30 rounded-md bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                  autoFocus
                />
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 font-mono">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 hover:border-cyan-500 font-mono">
                ACCESS SYSTEM
              </Button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AdminContext.Provider value={{ password, logout }}>
      <div className="min-h-screen bg-background">
        {/* Admin Header */}
        <header className="admin-header border-b border-cyan-500/20 sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <a href="/" className="text-cyan-500/70 hover:text-cyan-400 text-sm font-mono transition-colors flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="hidden sm:inline">Back to Wiki</span>
              </a>
              <div className="h-4 w-px bg-cyan-500/30 hidden sm:block" />
              <h1 className="text-lg sm:text-xl font-semibold font-mono text-cyan-400">
                ADMIN_DASH
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="border-cyan-500/30 text-cyan-500/70 hover:text-cyan-400 hover:border-cyan-500 hover:bg-cyan-500/10 font-mono text-xs"
            >
              LOGOUT
            </Button>
          </div>
        </header>

        {/* Admin Content */}
        <main className="container mx-auto px-4 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  )
}
