#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'search-index.json');

/**
 * Recursively get all markdown/MDX files
 */
function getMarkdownFiles(dir, baseDir = dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...getMarkdownFiles(fullPath, baseDir));
      }
    } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Build search index from all docs
 */
function buildSearchIndex() {
  console.log('🔍 Building search index...\n');

  const markdownFiles = getMarkdownFiles(DOCS_DIR);
  const searchIndex = [];

  for (const file of markdownFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const { data, content: rawContent } = matter(content);

      // Generate slug from file path
      const relativePath = path.relative(DOCS_DIR, file);
      const slug = relativePath
        .replace(/\.(md|mdx)$/, '')
        .replace(/\\/g, '/')
        .replace(/\/README$/i, '')
        .replace(/^README$/i, '')
        .toLowerCase();

      // Extract category (first segment)
      const category = slug.split('/')[0];

      // Clean content for search
      const cleanContent = rawContent
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]+`/g, '') // Remove inline code
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
        .replace(/[#*_]/g, '') // Remove markdown symbols
        .replace(/\n+/g, ' ') // Normalize whitespace
        .trim()
        .slice(0, 1000); // Limit length

      searchIndex.push({
        id: slug,
        title: data.title || path.basename(file, path.extname(file)),
        content: cleanContent,
        url: `/${slug}`,
        category,
      });

      console.log(`✓ Indexed ${slug}`);
    } catch (error) {
      console.error(`✗ Error processing ${file}:`, error.message);
    }
  }

  return searchIndex;
}

/**
 * Main execution
 */
function main() {
  // Create public directory if it doesn't exist
  const publicDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const searchIndex = buildSearchIndex();

  // Write to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(searchIndex, null, 2));

  console.log(`\n✨ Search index generated: ${searchIndex.length} documents`);
  console.log(`📝 Output: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildSearchIndex };
