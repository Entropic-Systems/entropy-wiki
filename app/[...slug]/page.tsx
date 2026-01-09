import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { DocLayout } from '@/components/layout/DocLayout'
import { components } from '@/components/mdx/MDXComponents'
import { getDocBySlug, docExists } from '@/lib/mdx/get-doc-by-slug'
import { getAllDocs } from '@/lib/mdx/get-all-docs'
import { parseTableOfContents } from '@/lib/mdx/parse-toc'
import { buildSectionNavTree } from '@/lib/navigation/build-nav-tree'
import { mdxOptions } from '@/lib/mdx/mdx-plugins'

interface DocPageProps {
  params: {
    slug: string[]
  }
}

/**
 * Generate static params for all documentation pages
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
  const doc = await getDocBySlug(params.slug)

  if (!doc) {
    return {
      title: 'Not Found',
    }
  }

  return {
    title: doc.frontMatter.title,
    description: doc.frontMatter.description,
  }
}

/**
 * Documentation page component
 */
export default async function DocPage({ params }: DocPageProps) {
  // Check if doc exists
  if (!docExists(params.slug)) {
    notFound()
  }

  const doc = await getDocBySlug(params.slug)

  if (!doc) {
    notFound()
  }

  // Get the section (first segment of slug) for sidebar
  const section = params.slug[0]
  const sidebarNav = buildSectionNavTree(section)

  // Parse table of contents from the raw content
  // Note: We need to get the raw content for TOC parsing
  const { getAllDocs: getAllDocsSync } = await import('@/lib/mdx/get-all-docs')
  const allDocs = getAllDocsSync()
  const currentDoc = allDocs.find(d => d.slug === params.slug.join('/'))
  const toc = currentDoc ? parseTableOfContents(currentDoc.content) : { items: [] }

  return (
    <DocLayout sidebar={sidebarNav} toc={toc}>
      <article className="prose prose-slate dark:prose-invert max-w-none">
        <h1>{doc.frontMatter.title}</h1>
        {doc.frontMatter.description && (
          <p className="text-xl text-muted-foreground">
            {doc.frontMatter.description}
          </p>
        )}
        <MDXRemote
          source={doc.mdxSource.compiledSource}
          components={components}
          options={mdxOptions}
        />
      </article>
    </DocLayout>
  )
}
