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
      } catch (err: any) {
        // _migrations table doesn't exist yet, that's fine
        if (err.code !== '42P01') throw err;
      }

      console.log(`Applying ${migrationName}...`);
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      await query(sql);
      console.log(`Applied ${migrationName}`);
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
