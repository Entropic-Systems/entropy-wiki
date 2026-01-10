#!/usr/bin/env tsx
/**
 * Migration Script: wiki/*.md → PostgreSQL
 *
 * Reads all markdown files from the wiki directory and inserts them
 * as published pages in the database. Idempotent - skips existing slugs.
 *
 * Usage:
 *   cd api && npm run db:migrate  # Ensure schema exists first
 *   cd api && npx tsx scripts/migrate-markdown-to-db.ts
 *
 * Requires DATABASE_URL environment variable.
 */

import 'dotenv/config';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

const WIKI_DIR = join(import.meta.dirname, '..', '..', 'wiki');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

interface PageData {
  slug: string;
  title: string;
  content_md: string;
  filePath: string;
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      findMarkdownFiles(fullPath, files);
    } else if (entry.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract title from markdown content
 * Looks for first # heading or uses filename
 */
function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }

  // Fallback to filename
  const filename = basename(filePath, '.md');
  return filename.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Convert file path to URL slug
 * wiki/beads/README.md -> beads
 * wiki/beads/cli-reference.md -> beads/cli-reference
 */
function pathToSlug(filePath: string): string {
  const relativePath = relative(WIKI_DIR, filePath);
  const dir = dirname(relativePath);
  const filename = basename(relativePath, '.md');

  // README.md becomes just the directory name
  if (filename.toLowerCase() === 'readme') {
    return dir === '.' ? '' : dir;
  }

  // Other files become dir/filename
  if (dir === '.') {
    return filename;
  }

  return `${dir}/${filename}`;
}

/**
 * Parse all markdown files into page data
 */
function parseMarkdownFiles(): PageData[] {
  const files = findMarkdownFiles(WIKI_DIR);
  const pages: PageData[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const slug = pathToSlug(filePath);
    const title = extractTitle(content, filePath);

    pages.push({
      slug,
      title,
      content_md: content,
      filePath: relative(WIKI_DIR, filePath),
    });
  }

  return pages;
}

/**
 * Insert pages into database (idempotent)
 */
async function migratePages(pages: PageData[]): Promise<void> {
  console.log(`Found ${pages.length} markdown files to migrate\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const page of pages) {
    const client = await pool.connect();

    try {
      // Check if slug already exists
      const existing = await client.query(
        'SELECT id FROM pages WHERE slug = $1',
        [page.slug]
      );

      if (existing.rows.length > 0) {
        console.log(`⏭️  Skipped (exists): ${page.slug}`);
        skipped++;
        continue;
      }

      // Insert new page with revision
      await client.query('BEGIN');

      const pageId = uuidv4();
      const revisionId = uuidv4();

      // Create revision
      await client.query(
        `INSERT INTO page_revisions (id, page_id, content_md, author_type)
         VALUES ($1, $2, $3, 'human')`,
        [revisionId, pageId, page.content_md]
      );

      // Create page as published
      await client.query(
        `INSERT INTO pages (id, slug, title, status, visibility, current_published_revision_id)
         VALUES ($1, $2, $3, 'published', 'public', $4)`,
        [pageId, page.slug, page.title, revisionId]
      );

      await client.query('COMMIT');

      console.log(`✅ Inserted: ${page.slug} (${page.title})`);
      inserted++;
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`❌ Error inserting ${page.slug}:`, err.message);
      errors++;
    } finally {
      client.release();
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Errors:   ${errors}`);
}

async function main() {
  console.log('🚀 Starting markdown migration to PostgreSQL\n');
  console.log(`📁 Wiki directory: ${WIKI_DIR}`);
  console.log(`🔗 Database: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}\n`);

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  try {
    const pages = parseMarkdownFiles();
    await migratePages(pages);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log('\n✨ Migration complete!');
}

main();
