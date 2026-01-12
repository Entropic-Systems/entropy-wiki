import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { DocLayout } from '@/components/layout/DocLayout'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { getDocBySlug, docExists } from '@/lib/mdx/get-doc-by-slug'
import { getAllDocs } from '@/lib/mdx/get-all-docs'
import { buildSectionNavTree } from '@/lib/navigation/build-nav-tree'
import { fetchPageFromApi, pageToMDXDocument } from '@/lib/api/server'
import type { MDXDocument } from '@/lib/mdx/types'

// Use ISR with 60 second revalidation for fresh content
// This allows static generation while still checking API for updates
export const revalidate = 60

interface DocPageProps {
  params: Promise<{
    slug: string[]
  }>
}

/**
 * Get document from filesystem first, fallback to API
 * Filesystem is prioritized for static generation reliability
 */
async function getDocument(slug: string[]): Promise<MDXDocument | null> {
  // Try filesystem first (more reliable for static generation)
  const fsDoc = getDocBySlug(slug)
  if (fsDoc) {
    return fsDoc
  }

  // Fallback to API for dynamic content
  const slugString = slug.join('/')
  const apiPage = await fetchPageFromApi(slugString)
  if (apiPage) {
    return pageToMDXDocument(apiPage, slug)
  }

  return null
}

/**
 * Check if document exists (filesystem or API)
 * Filesystem is prioritized for static generation reliability
 */
async function documentExists(slug: string[]): Promise<boolean> {
  // Try filesystem first
  if (docExists(slug)) {
    return true
  }

  // Fallback to API
  const slugString = slug.join('/')
  const apiPage = await fetchPageFromApi(slugString)
  return apiPage !== null
}

/**
 * Generate static params for all documentation pages
 * Uses filesystem for static generation (API pages are dynamic)
 */
export async function generateStaticParams() {
  const docs = getAllDocs()

  return docs.map((doc) => ({
    slug: doc.slug.split('/'),
  }))
}

/**
 * Generate metadata for each page
 */
export async function generateMetadata({ params }: DocPageProps) {
  const { slug } = await params
  const doc = await getDocument(slug)

  if (!doc) {
    return {
      title: 'Not Found',
    }
  }

  const title = doc.frontMatter.title
  const description = doc.frontMatter.description || 'Entropy Wiki - Cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets'
  const url = `https://entropy-wiki.vercel.app/${slug.join('/')}`

  return {
    title: `${title} | Entropy Wiki`,
    description,
    openGraph: {
      title: `${title} | Entropy Wiki`,
      description,
      url,
      siteName: 'Entropy Wiki',
      type: 'article',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Entropy Wiki`,
      description,
    },
    alternates: {
      canonical: url,
    },
  }
}

/**
 * Documentation page component
 */
export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params

  // Check if doc exists (API or filesystem)
  if (!await documentExists(slug)) {
    notFound()
  }

  const doc = await getDocument(slug)

  if (!doc) {
    notFound()
  }

  // Get the section (first segment of slug) for sidebar
  const section = slug[0]
  const sidebarNav = buildSectionNavTree(section)

  // Remove the first h1 from content since we already extract it as title
  const contentWithoutTitle = doc.content.replace(/^#\s+.+$/m, '').trim()

  return (
    <DocLayout sidebar={sidebarNav}>
      <Breadcrumb slug={slug} />

      <article className="prose prose-slate dark:prose-invert max-w-none mt-2">
        <h1 className="mb-2">{doc.frontMatter.title}</h1>
        {doc.frontMatter.description && (
          <p className="text-xl text-muted-foreground mb-8">
            {doc.frontMatter.description}
          </p>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
        >
          {contentWithoutTitle}
        </ReactMarkdown>
      </article>
    </DocLayout>
  )
}
