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
        <div className="w-full max-w-sm p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Admin Login</h1>
            <p className="text-muted-foreground mt-2">
              Enter your admin password to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                placeholder="Admin password"
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}

            <Button type="submit" className="w-full">
              Login
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <AdminContext.Provider value={{ password, logout }}>
      <div className="min-h-screen bg-background">
        {/* Admin Header */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <a href="/" className="text-muted-foreground hover:text-foreground text-sm">
                ← Back to Wiki
              </a>
              <h1 className="text-xl font-semibold">Admin Dashboard</h1>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </header>

        {/* Admin Content */}
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  )
}
