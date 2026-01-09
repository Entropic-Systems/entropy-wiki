import { Header } from './Header'
import { Footer } from './Footer'
import { Sidebar } from './Sidebar'
import { SectionNav } from '../navigation/SectionNav'
import type { SidebarNavItem } from '@/lib/navigation/types'
import type { TableOfContents as TOC } from '@/lib/mdx/types'

interface DocLayoutProps {
  children: React.ReactNode
  sidebar?: SidebarNavItem[]
  toc?: TOC
}

export function DocLayout({ children, sidebar }: DocLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <SectionNav />

      <div className="container flex-1 items-start md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-8 lg:gap-12">
        {sidebar && sidebar.length > 0 && <Sidebar items={sidebar} />}

        <main className="relative py-6 lg:py-8 max-w-4xl">
          {children}
        </main>
      </div>

      <Footer />
    </div>
  )
}
