import rehypePrettyCode from 'rehype-pretty-code'
import type { Options } from 'rehype-pretty-code'

export const rehypePrettyCodeOptions: Options = {
  theme: {
    dark: 'github-dark',
    light: 'github-light',
  },
  keepBackground: false,
  onVisitLine(node: any) {
    // Prevent lines from collapsing in `display: grid` mode
    if (node.children.length === 0) {
      node.children = [{ type: 'text', value: ' ' }]
    }
  },
  onVisitHighlightedLine(node: any) {
    node.properties.className?.push('line--highlighted')
  },
}

export const mdxOptions = {
  remarkPlugins: [],
  rehypePlugins: [[rehypePrettyCode, rehypePrettyCodeOptions]],
}
