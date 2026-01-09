export interface FrontMatter {
  title: string
  description?: string
  date?: string
  author?: string
  tags?: string[]
  draft?: boolean
  [key: string]: any
}

export interface MDXDocument {
  frontMatter: FrontMatter
  content: string
  slug: string
  filePath: string
}

export interface TableOfContentsItem {
  id: string
  title: string
  level: number
}

export interface TableOfContents {
  items: TableOfContentsItem[]
}
