import { SectionNav } from './SectionNav'
import { buildNavTree } from '@/lib/navigation/build-nav-tree'

const API_BASE_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface NavItem {
  title: string
  href: string
  items: NavItem[]
}

/**
 * Server component that fetches sections from API and passes to client SectionNav
 * Falls back to filesystem if API unavailable
 */
export async function SectionNavServer() {
  let sections: { title: string; href: string; items: never[] }[] = []

  try {
    // Fetch from API for dynamic navigation based on publish status
    const response = await fetch(`${API_BASE_URL}/pages/nav`, {
      next: { revalidate: 60 }, // Revalidate every 60 seconds
    })

    if (response.ok) {
      const data = await response.json()
      if (data.nav && Array.isArray(data.nav)) {
        sections = data.nav
          .filter((item: NavItem) => item.items?.length > 0 || item.href !== '/home')
          .map((item: NavItem) => ({
            title: item.title,
            href: item.href,
            items: [],
          }))
      }
    }
  } catch (err) {
    console.log('API unavailable for navigation, falling back to filesystem')
  }

  // Fallback to filesystem if API failed or returned no sections
  if (sections.length === 0) {
    const navTree = buildNavTree()
    sections = navTree
      .filter((item) => item.href) // Only include items with hrefs
      .map((item) => ({
        title: item.title,
        href: item.href as string,
        items: [],
      }))
  }

  return <SectionNav sections={sections} />
}
