import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { siteConfig } from '@/config/site'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32">
          <div className="container flex max-w-[64rem] flex-col items-center gap-4 text-center">
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold">
              ⚡ Entropy Wiki
            </h1>
            <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
              Cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets.
              Capture the chaos of real systems, compress it, and ship it as repeatable advantage.
            </p>
            <div className="flex gap-4">
              <Button size="lg" asChild>
                <Link href="/beads">Get Started</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href={siteConfig.links.github} target="_blank" rel="noreferrer">
                  GitHub
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="container space-y-6 py-8 md:py-12 lg:py-24">
          <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
            <h2 className="text-3xl font-bold leading-[1.1] sm:text-3xl md:text-6xl">
              Architecture
            </h2>
            <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              High-signal, plug-and-play, and deployable documentation for AI agents.
            </p>
          </div>

          <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
            <FeatureCard
              title="Beads"
              description="Atomic logic snippets and issue tracking system"
              href="/beads"
            />
            <FeatureCard
              title="Gastown"
              description="Multi-agent orchestration and rig standards"
              href="/gastown"
            />
            <FeatureCard
              title="Skills Bank"
              description="Functional capabilities and reusable skills"
              href="/skills-bank"
            />
            <FeatureCard
              title="Prompt Bank"
              description="Categorized, high-performance prompts"
              href="/prompt-bank"
            />
            <FeatureCard
              title="Tooling & MCP"
              description="MCP server configs and custom tool definitions"
              href="/tooling-mcp"
            />
            <FeatureCard
              title="Orchestration"
              description="Multi-agent handoff protocols"
              href="/orchestration"
            />
          </div>
        </section>

        {/* CTA Section */}
        <section className="container py-8 md:py-12 lg:py-24">
          <div className="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl font-bold leading-[1.1] sm:text-3xl md:text-5xl">
              Ready to dive in?
            </h2>
            <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
              Start with the Beads documentation to understand the issue tracking system,
              or explore Gastown for multi-agent orchestration.
            </p>
            <div className="flex gap-4">
              <Button size="lg" asChild>
                <Link href="/beads">Beads Docs</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/gastown">Gastown Docs</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

interface FeatureCardProps {
  title: string
  description: string
  href: string
}

function FeatureCard({ title, description, href }: FeatureCardProps) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-lg border bg-background p-6 hover:shadow-lg transition-all"
    >
      <div className="flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          <h3 className="font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="text-sm font-medium text-primary group-hover:underline">
          Learn more →
        </div>
      </div>
    </Link>
  )
}
