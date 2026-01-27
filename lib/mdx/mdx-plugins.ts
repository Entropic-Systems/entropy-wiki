import rehypePrettyCode from 'rehype-pretty-code'
import type { Options } from 'rehype-pretty-code'
import type { Element } from 'hast'

export const rehypePrettyCodeOptions: Options = {
  theme: {
    dark: 'github-dark',
    light: 'github-light',
  },
  keepBackground: false,
  onVisitLine(node: Element) {
    // Prevent lines from collapsing in `display: grid` mode
    if (node.children.length === 0) {
      node.children = [{ type: 'text', value: ' ' }]
    }
  },
  onVisitHighlightedLine(node: Element) {
    // Safely add class name if properties and className exist
    if (node.properties && Array.isArray(node.properties.className)) {
      node.properties.className.push('line--highlighted')
    }
  },
}

export const mdxOptions = {
  remarkPlugins: [],
  rehypePlugins: [[rehypePrettyCode, rehypePrettyCodeOptions]],
}
