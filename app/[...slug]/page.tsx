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
 * Get document from filesystem only
 * API fallback disabled due to Railway database issues
 */
function getDocument(slug: string[]): MDXDocument | null {
  return getDocBySlug(slug)
}

/**
 * Check if document exists in filesystem
 * API fallback disabled due to Railway database issues
 */
function documentExists(slug: string[]): boolean {
  return docExists(slug)
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
  const doc = getDocument(slug)

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

  // Check if doc exists in filesystem
  if (!documentExists(slug)) {
    notFound()
  }

  const doc = getDocument(slug)

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
