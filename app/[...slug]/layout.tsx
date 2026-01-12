import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Entropy Wiki',
  description: 'Cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets',
}

export default function SlugLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This is a nested layout - it inherits from the root layout
  // Do NOT render <html>, <body>, or ThemeProvider here
  // Those are handled by app/layout.tsx
  return <>{children}</>
}
