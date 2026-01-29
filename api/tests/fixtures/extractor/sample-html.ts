/**
 * Sample HTML fixtures for extractor testing
 */

export const sampleArticleHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Sample Article Title</title>
  <meta property="og:title" content="OG Title Override">
  <meta property="og:description" content="This is the OG description">
  <meta name="keywords" content="javascript, typescript, testing">
</head>
<body>
  <nav>Navigation that should be removed</nav>
  <header>Header content</header>
  <article>
    <h1>Main Article Heading</h1>
    <p>This is the first paragraph of the article content. It contains important information.</p>
    <p>Second paragraph with more details about the topic.</p>
    <pre><code class="language-javascript">const example = 'code block';</code></pre>
    <p>Final paragraph wrapping up the content.</p>
  </article>
  <aside class="sidebar">Sidebar content to remove</aside>
  <footer>Footer content</footer>
  <script>console.log('This should be removed');</script>
</body>
</html>
`;

export const sampleArticleNoMeta = `
<!DOCTYPE html>
<html>
<head>
  <title>Page Title Only</title>
</head>
<body>
  <main>
    <h1>Content Heading</h1>
    <p>Simple article content without meta tags.</p>
  </main>
</body>
</html>
`;

export const sampleArticleMinimal = `
<!DOCTYPE html>
<html>
<body>
  <div class="content">
    <p>Just some text content without any structure.</p>
  </div>
</body>
</html>
`;

export const sampleMalformedHtml = `
<html>
<head><title>Malformed
<body>
<p>Unclosed paragraph
<div>Unclosed div
<script>alert('xss')</script>
`;

export const sampleXssAttemptHtml = `
<!DOCTYPE html>
<html>
<body>
  <article>
    <h1>Normal Title</h1>
    <p>Normal content</p>
    <script>document.cookie</script>
    <img src="x" onerror="alert('xss')">
    <a href="javascript:alert('xss')">Click me</a>
    <iframe src="https://evil.com"></iframe>
    <style>body { background: url('javascript:alert(1)'); }</style>
  </article>
</body>
</html>
`;

export const sampleLargeHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Large Document</title>
  <meta property="og:description" content="A very large document for performance testing">
</head>
<body>
  <article>
    <h1>Large Document Title</h1>
    ${Array(100).fill('<p>This is a repeated paragraph with significant content for testing large document processing. It contains multiple sentences to ensure adequate length.</p>').join('\n')}
  </article>
</body>
</html>
`;

export const sampleTwitterOEmbed = {
  url: 'https://twitter.com/anthropic/status/1234567890',
  author_name: 'Anthropic',
  author_url: 'https://twitter.com/anthropic',
  html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">This is a sample tweet content for testing purposes. #AI #Claude</p>&mdash; Anthropic (@anthropic) <a href="https://twitter.com/anthropic/status/1234567890">January 28, 2026</a></blockquote>',
  width: 550,
  height: null,
  type: 'rich',
  cache_age: '3153600000',
  provider_name: 'Twitter',
  provider_url: 'https://twitter.com',
  version: '1.0',
};

export const sampleGitHubRepo = {
  id: 12345,
  full_name: 'anthropics/claude-code',
  name: 'claude-code',
  description: 'AI-powered coding assistant CLI',
  html_url: 'https://github.com/anthropics/claude-code',
  stargazers_count: 5000,
  forks_count: 500,
  language: 'TypeScript',
  topics: ['ai', 'cli', 'developer-tools'],
  license: { name: 'MIT' },
  owner: { login: 'anthropics' },
};

export const sampleGitHubReadme = `# Claude Code

AI-powered coding assistant for the command line.

## Features

- Context-aware code suggestions
- Multi-file editing
- Natural language commands

## Installation

\`\`\`bash
npm install -g @anthropic/claude-code
\`\`\`

## Usage

\`\`\`bash
claude-code
\`\`\`
`;

export const sampleGitHubIssue = {
  number: 42,
  title: 'Feature: Add dark mode support',
  body: 'It would be great to have a dark mode option for the CLI.\n\n## Proposed Solution\n\nAdd a `--dark` flag or auto-detect terminal theme.',
  state: 'open',
  labels: [{ name: 'enhancement' }, { name: 'good first issue' }],
  user: { login: 'contributor123' },
  created_at: '2026-01-15T10:00:00Z',
  html_url: 'https://github.com/anthropics/claude-code/issues/42',
};

export const sampleRawTextWithHeading = `# My Document Title

This is the first paragraph of the document.

## Section One

Content for section one goes here.

## Section Two

Content for section two.
`;

export const sampleRawTextNoHeading = `This is just plain text content.
It doesn't have any markdown headings.
Multiple paragraphs are present.

Another paragraph here with more content.
`;

export const sampleRawTextShortTitle = `API Reference

This document describes the API endpoints.

## GET /users

Returns a list of users.
`;
