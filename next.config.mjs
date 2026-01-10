import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/beads',
        permanent: true,
      },
      // Handle legacy .md extension URLs
      {
        source: '/:path*.md',
        destination: '/:path*',
        permanent: true,
      },
      // Handle README.md URLs -> parent directory
      {
        source: '/:path*/README',
        destination: '/:path*',
        permanent: true,
      },
    ]
  },
}

export default withBundleAnalyzer(nextConfig)
