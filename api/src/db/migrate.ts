import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { query, closePool } from './client.js';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

async function migrate() {
  console.log('Running migrations...');

  try {
    // Get list of migration files
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migrationName = file.replace('.sql', '');

      // Check if already applied
      try {
        const result = await query(
          'SELECT 1 FROM _migrations WHERE name = $1',
          [migrationName]
        );

        if (result.rows.length > 0) {
          console.log(`Skipping ${migrationName} (already applied)`);
          continue;
        }
      } catch (err) {
        // _migrations table doesn't exist yet, that's fine
        const pgError = err as { code?: string };
        if (pgError.code !== '42P01') throw err;
      }

      console.log(`Applying ${migrationName}...`);
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

      try {
        await query(sql);
        console.log(`Applied ${migrationName}`);
      } catch (err) {
        // Skip optional migrations that require unavailable extensions (e.g., pgvector)
        const pgError = err as { code?: string; message?: string };
        if (pgError.code === '0A000' && pgError.message?.includes('extension') && migrationName.includes('embeddings')) {
          console.log(`Skipping ${migrationName} (pgvector extension not available - embeddings disabled)`);
          // Record as skipped so we don't retry every time
          await query(
            "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
            [`${migrationName}_skipped`]
          ).catch(() => {}); // Ignore if this fails
          continue;
        }
        throw err;
      }
    }

    console.log('All migrations complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

migrate();
