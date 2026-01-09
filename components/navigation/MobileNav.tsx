"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '../ui/button'
import { siteConfig } from '@/config/site'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 w-9"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        aria-label="Toggle navigation menu"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        <span className="sr-only">Toggle menu</span>
      </Button>

      {isOpen && (
        <div
          id="mobile-menu"
          className="fixed inset-0 top-14 z-50 grid h-[calc(100vh-3.5rem)] grid-flow-row auto-rows-max overflow-auto bg-background p-6 shadow-md animate-in slide-in-from-bottom-80 md:hidden"
          role="dialog"
          aria-label="Mobile navigation"
        >
          <nav className="grid gap-4 text-sm font-medium" aria-label="Mobile sections">
            <Link
              href="/beads"
              onClick={() => setIsOpen(false)}
              className="hover:text-foreground/80"
            >
              Beads
            </Link>
            <Link
              href="/gastown"
              onClick={() => setIsOpen(false)}
              className="hover:text-foreground/80"
            >
              Gastown
            </Link>
            <Link
              href="/skills-bank"
              onClick={() => setIsOpen(false)}
              className="hover:text-foreground/80"
            >
              Skills Bank
            </Link>
            <Link
              href="/prompt-bank"
              onClick={() => setIsOpen(false)}
              className="hover:text-foreground/80"
            >
              Prompt Bank
            </Link>
            <Link
              href="/tooling-mcp"
              onClick={() => setIsOpen(false)}
              className="hover:text-foreground/80"
            >
              Tooling & MCP
            </Link>
          </nav>
        </div>
      )}
    </div>
  )
}
