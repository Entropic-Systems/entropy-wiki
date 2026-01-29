/**
 * Migration Runner
 *
 * Automates schema setup for test databases by running migrations
 * in order. Supports selective migration running and rollback simulation.
 */

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MigrationResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface MigrationRunResult {
  success: boolean;
  migrations: MigrationResult[];
  totalDuration: number;
  failedAt?: string;
}

export interface MigrationRunnerConfig {
  /** Path to migrations directory */
  migrationsPath?: string;
  /** Run only up to this migration (inclusive) */
  upTo?: string;
  /** Skip these migrations by name */
  skip?: string[];
  /** Run in dry-run mode (parse but don't execute) */
  dryRun?: boolean;
  /** Timeout per migration in milliseconds */
  migrationTimeout?: number;
}

const DEFAULT_MIGRATIONS_PATH = join(__dirname, '../../src/db/migrations');

/**
 * Runs database migrations on a given pool
 */
export class MigrationRunner {
  private pool: pg.Pool;
  private config: Required<MigrationRunnerConfig>;

  constructor(pool: pg.Pool, config: MigrationRunnerConfig = {}) {
    this.pool = pool;
    this.config = {
      migrationsPath: config.migrationsPath || DEFAULT_MIGRATIONS_PATH,
      upTo: config.upTo || '',
      skip: config.skip || [],
      dryRun: config.dryRun || false,
      migrationTimeout: config.migrationTimeout || 30000,
    };
  }

  /**
   * Get list of available migration files
   */
  getMigrationFiles(): string[] {
    const { migrationsPath } = this.config;

    if (!existsSync(migrationsPath)) {
      console.warn(`Migrations directory not found: ${migrationsPath}`);
      return [];
    }

    return readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensures 001_, 002_, etc. order
  }

  /**
   * Create the migrations tracking table
   */
  async createMigrationsTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        duration_ms INTEGER
      )
    `);
  }

  /**
   * Check which migrations have already been applied
   */
  async getAppliedMigrations(): Promise<Set<string>> {
    try {
      const result = await this.pool.query<{ name: string }>(
        'SELECT name FROM _migrations ORDER BY name'
      );
      return new Set(result.rows.map(r => r.name));
    } catch {
      // Table doesn't exist yet
      return new Set();
    }
  }

  /**
   * Run a single migration with timeout
   */
  private async runMigration(
    client: pg.PoolClient,
    name: string,
    sql: string
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Set statement timeout for this migration
      await client.query(`SET statement_timeout = ${this.config.migrationTimeout}`);

      if (!this.config.dryRun) {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name, duration_ms) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [name, Date.now() - startTime]
        );
      }

      return {
        name,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        name,
        success: false,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Run all pending migrations
   */
  async runAll(): Promise<MigrationRunResult> {
    const startTime = Date.now();
    const results: MigrationResult[] = [];
    let failedAt: string | undefined;

    await this.createMigrationsTable();
    const applied = await this.getAppliedMigrations();
    const files = this.getMigrationFiles();

    const client = await this.pool.connect();
    try {
      for (const file of files) {
        // Check if we should stop at a certain migration
        if (this.config.upTo && file > this.config.upTo) {
          break;
        }

        // Skip if already applied
        if (applied.has(file)) {
          results.push({
            name: file,
            success: true,
            duration: 0,
          });
          continue;
        }

        // Skip if in skip list
        if (this.config.skip.includes(file)) {
          continue;
        }

        // Read and run the migration
        const migrationPath = join(this.config.migrationsPath, file);
        const sql = readFileSync(migrationPath, 'utf-8');

        const result = await this.runMigration(client, file, sql);
        results.push(result);

        if (!result.success) {
          failedAt = file;
          break;
        }
      }
    } finally {
      client.release();
    }

    return {
      success: !failedAt,
      migrations: results,
      totalDuration: Date.now() - startTime,
      failedAt,
    };
  }

  /**
   * Run a specific migration by name
   */
  async runOne(name: string): Promise<MigrationResult> {
    await this.createMigrationsTable();

    const migrationPath = join(this.config.migrationsPath, name);
    if (!existsSync(migrationPath)) {
      return {
        name,
        success: false,
        duration: 0,
        error: `Migration file not found: ${name}`,
      };
    }

    const sql = readFileSync(migrationPath, 'utf-8');
    const client = await this.pool.connect();

    try {
      return await this.runMigration(client, name, sql);
    } finally {
      client.release();
    }
  }

  /**
   * Reset the database by dropping all tables and re-running migrations
   */
  async reset(): Promise<MigrationRunResult> {
    // Drop all tables (careful - this is destructive!)
    const client = await this.pool.connect();
    try {
      // Get all tables
      const tables = await client.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
      `);

      // Drop all tables
      for (const { tablename } of tables.rows) {
        await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
      }

      // Drop extensions
      await client.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
      await client.query('DROP EXTENSION IF EXISTS vector CASCADE');
    } finally {
      client.release();
    }

    // Re-run all migrations
    return this.runAll();
  }

  /**
   * Validate migration files without running them
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const files = this.getMigrationFiles();

    for (const file of files) {
      const migrationPath = join(this.config.migrationsPath, file);

      try {
        const sql = readFileSync(migrationPath, 'utf-8');

        // Basic SQL validation
        if (sql.trim().length === 0) {
          errors.push(`${file}: Empty migration file`);
        }

        // Check for common issues
        if (sql.includes('DROP DATABASE')) {
          errors.push(`${file}: Contains DROP DATABASE (dangerous)`);
        }

        if (sql.includes('TRUNCATE') && !sql.includes('CASCADE')) {
          errors.push(`${file}: TRUNCATE without CASCADE may fail with FK constraints`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${file}: Failed to read - ${msg}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Quick helper to run all migrations on a pool
 */
export async function runMigrations(
  pool: pg.Pool,
  config?: MigrationRunnerConfig
): Promise<MigrationRunResult> {
  const runner = new MigrationRunner(pool, config);
  return runner.runAll();
}

/**
 * Quick helper to reset and re-run all migrations
 */
export async function resetAndMigrate(
  pool: pg.Pool,
  config?: MigrationRunnerConfig
): Promise<MigrationRunResult> {
  const runner = new MigrationRunner(pool, config);
  return runner.reset();
}
