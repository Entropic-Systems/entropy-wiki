import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/providers/theme-provider'
import '@/styles/globals.css'

const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-code',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Entropy Wiki',
    template: '%s | Entropy Wiki',
  },
  description: 'Cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets. High-signal, plug-and-play documentation for AI agents.',
  keywords: ['AI', 'skills', 'prompts', 'MCP', 'agents', 'automation', 'tooling', 'beads', 'gastown'],
  authors: [{ name: 'Entropy Wiki' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://entropy-wiki.vercel.app',
    siteName: 'Entropy Wiki',
    title: 'Entropy Wiki',
    description: 'Cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Entropy Wiki',
    description: 'Cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
