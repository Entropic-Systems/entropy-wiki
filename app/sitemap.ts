import { MetadataRoute } from 'next'
import { getAllDocs } from '@/lib/mdx/get-all-docs'

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getAllDocs()
  const baseUrl = 'https://entropy-wiki.vercel.app'

  // Generate sitemap entries for all documentation pages
  const docEntries: MetadataRoute.Sitemap = docs.map((doc) => ({
    url: `${baseUrl}/${doc.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Add main sections
  const sections = [
    { slug: 'beads', priority: 1.0 },
    { slug: 'gastown', priority: 0.9 },
    { slug: 'skills-bank', priority: 0.9 },
    { slug: 'prompt-bank', priority: 0.9 },
    { slug: 'tooling-mcp', priority: 0.9 },
    { slug: 'orchestration', priority: 0.9 },
  ]

  const sectionEntries: MetadataRoute.Sitemap = sections.map((section) => ({
    url: `${baseUrl}/${section.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: section.priority,
  }))

  return [...sectionEntries, ...docEntries]
}
