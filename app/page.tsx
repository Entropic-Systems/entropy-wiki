import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { SectionNavServer } from '@/components/navigation/SectionNavServer'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SectionNavServer />

      {/* Hero Section */}
      <main className="container py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Are you ready to be a{' '}
            <span className="text-primary">Droid overlord</span>?
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Master AI orchestration. Command coding agents. Build software at scale with Claude Code, Codex, and beyond.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/claude-code"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Start with Claude Code
            </Link>
            <Link
              href="/orchestration/introduction"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Learn Orchestration
            </Link>
          </div>
        </div>

        {/* What This Wiki Covers */}
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-center mb-8">What You&apos;ll Learn</h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Claude Code Card */}
            <Link
              href="/claude-code"
              className="group p-6 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                Claude Code Mastery
              </h3>
              <p className="text-muted-foreground mb-4">
                Learn the AI coding assistant that runs in your terminal. Skills, hooks, commands, MCP servers - everything you need to work with AI agents.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>&#x2022; Skills &amp; Commands</li>
                <li>&#x2022; Hooks &amp; Events</li>
                <li>&#x2022; Agent Comparison (Codex, Amp)</li>
                <li>&#x2022; Plugins &amp; MCP Servers</li>
              </ul>
            </Link>

            {/* Orchestration Card */}
            <Link
              href="/orchestration"
              className="group p-6 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                AI Orchestration
              </h3>
              <p className="text-muted-foreground mb-4">
                Coordinate multiple AI agents to complete complex tasks autonomously. From simple patterns to production-scale frameworks.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>&#x2022; Multi-agent Coordination</li>
                <li>&#x2022; Frameworks (Gastown)</li>
                <li>&#x2022; Memory &amp; Persistence (Beads)</li>
                <li>&#x2022; Patterns (Ralph Loop)</li>
              </ul>
            </Link>
          </div>
        </div>

        {/* Quick Explainer */}
        <div className="max-w-3xl mx-auto mt-16 p-8 rounded-lg border bg-muted/30">
          <h2 className="text-xl font-semibold mb-4">
            New to AI Coding Agents?
          </h2>
          <p className="text-muted-foreground mb-4">
            AI coding agents like <strong>Claude Code</strong>, <strong>Codex</strong>, and <strong>Amp</strong> work the same way:
            they run in your terminal, read your codebase, execute commands, and iterate until your task is complete.
          </p>
          <p className="text-muted-foreground mb-4">
            This wiki focuses on <strong>Claude Code</strong> because it has the most extensible architecture (skills, hooks, MCP).
            But the patterns you learn here apply to all agents.
          </p>
          <p className="text-muted-foreground">
            Using multiple agents is smart - you can spread usage across providers to optimize costs and work around plan limits.
          </p>
        </div>
      </main>
    </div>
  )
}
