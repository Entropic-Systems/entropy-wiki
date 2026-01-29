/**
 * Test Database Isolation System
 *
 * Provides perfect test isolation by creating a dedicated PostgreSQL database
 * for each test. This ensures:
 * - No test coupling through shared database state
 * - Reliable parallel test execution
 * - Deterministic, reproducible test results
 *
 * @example
 * ```ts
 * import { TestDatabase } from '../utils/test-database.js';
 *
 * describe('MyService', () => {
 *   let testDb: TestDatabase;
 *
 *   beforeEach(async () => {
 *     testDb = await TestDatabase.create('my-service-test');
 *   });
 *
 *   afterEach(async () => {
 *     await testDb.cleanup();
 *   });
 *
 *   it('should do something', async () => {
 *     const pool = testDb.getPool();
 *     // Use pool for database operations
 *   });
 * });
 * ```
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration from environment
const ADMIN_DATABASE_URL = process.env.TEST_ADMIN_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres';

// Parse the admin connection URL for creating new databases
function parseConnectionUrl(url: string): {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
} {
  const parsed = new URL(url);
  return {
    user: parsed.username || 'postgres',
    password: parsed.password || '',
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port, 10) || 5432,
    database: parsed.pathname.slice(1) || 'postgres',
  };
}

// Generate a unique database name for each test
function generateTestDatabaseName(testName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedName = testName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .substring(0, 30);
  return `test_${sanitizedName}_${timestamp}_${random}`;
}

export interface TestDatabaseConfig {
  /** Custom database name (auto-generated if not provided) */
  databaseName?: string;
  /** Skip running migrations (useful for specific test scenarios) */
  skipMigrations?: boolean;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
}

export class TestDatabase {
  private adminPool: pg.Pool;
  private testPool: pg.Pool | null = null;
  private databaseName: string;
  private config: pg.PoolConfig;
  private isCleanedUp = false;

  private constructor(
    databaseName: string,
    adminPool: pg.Pool,
    config: pg.PoolConfig
  ) {
    this.databaseName = databaseName;
    this.adminPool = adminPool;
    this.config = config;
  }

  /**
   * Create a new isolated test database
   *
   * @param testName - Name of the test (used for database naming)
   * @param options - Configuration options
   * @returns Initialized TestDatabase instance
   */
  static async create(
    testName: string,
    options: TestDatabaseConfig = {}
  ): Promise<TestDatabase> {
    const databaseName = options.databaseName || generateTestDatabaseName(testName);
    const parsed = parseConnectionUrl(ADMIN_DATABASE_URL);

    // Create admin connection to create the test database
    const adminPool = new pg.Pool({
      user: parsed.user,
      password: parsed.password,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      max: 1,
      connectionTimeoutMillis: options.connectionTimeout || 10000,
    });

    const config: pg.PoolConfig = {
      user: parsed.user,
      password: parsed.password,
      host: parsed.host,
      port: parsed.port,
      database: databaseName,
      max: 5,
      connectionTimeoutMillis: options.connectionTimeout || 10000,
    };

    const testDb = new TestDatabase(databaseName, adminPool, config);

    try {
      // Create the test database
      await testDb.createDatabase();

      // Connect to the new database
      testDb.testPool = new pg.Pool(config);

      // Run migrations unless skipped
      if (!options.skipMigrations) {
        await testDb.runMigrations();
      }

      return testDb;
    } catch (error) {
      // Clean up on failure
      await testDb.cleanup().catch(() => {});
      throw error;
    }
  }

  /**
   * Create the test database
   */
  private async createDatabase(): Promise<void> {
    // Terminate any existing connections to the database (shouldn't exist, but just in case)
    await this.adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
      AND pid <> pg_backend_pid()
    `, [this.databaseName]).catch(() => {});

    // Drop database if it exists (from a previous failed run)
    await this.adminPool.query(`DROP DATABASE IF EXISTS "${this.databaseName}"`).catch(() => {});

    // Create the new database
    await this.adminPool.query(`CREATE DATABASE "${this.databaseName}"`);
  }

  /**
   * Run all migrations on the test database
   */
  private async runMigrations(): Promise<void> {
    if (!this.testPool) {
      throw new Error('Test pool not initialized');
    }

    const migrationsDir = join(__dirname, '../../src/db/migrations');

    // Get all migration files sorted by name
    let migrationFiles: string[];
    try {
      migrationFiles = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    } catch (error) {
      // If migrations directory doesn't exist, just create the basic schema
      console.warn('No migrations directory found, skipping migrations');
      return;
    }

    // Create migrations tracking table
    await this.testPool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Run each migration
    for (const file of migrationFiles) {
      const migrationPath = join(migrationsDir, file);
      const sql = readFileSync(migrationPath, 'utf-8');

      try {
        await this.testPool.query(sql);
        await this.testPool.query(
          'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
      } catch (error) {
        console.error(`Migration ${file} failed:`, error);
        throw error;
      }
    }
  }

  /**
   * Get the database connection pool
   */
  getPool(): pg.Pool {
    if (!this.testPool) {
      throw new Error('Test database not initialized');
    }
    return this.testPool;
  }

  /**
   * Get the database name
   */
  getDatabaseName(): string {
    return this.databaseName;
  }

  /**
   * Get a connection URL for this test database
   */
  getConnectionUrl(): string {
    const parsed = parseConnectionUrl(ADMIN_DATABASE_URL);
    return `postgresql://${parsed.user}:${parsed.password}@${parsed.host}:${parsed.port}/${this.databaseName}`;
  }

  /**
   * Execute a query on the test database
   */
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    if (!this.testPool) {
      throw new Error('Test database not initialized');
    }
    return this.testPool.query<T>(sql, params);
  }

  /**
   * Insert test data into a table
   */
  async insertTestData<T extends Record<string, unknown>>(
    table: string,
    data: T | T[]
  ): Promise<pg.QueryResult> {
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };

    const columns = Object.keys(rows[0]);
    const placeholders = rows.map((_, rowIndex) =>
      `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
    ).join(', ');

    const values = rows.flatMap(row => columns.map(col => row[col]));

    const sql = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders}`;
    return this.query(sql, values);
  }

  /**
   * Truncate tables (useful for resetting state within a test)
   */
  async truncateTables(tables: string[]): Promise<void> {
    for (const table of tables) {
      await this.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }
  }

  /**
   * Clean up the test database
   */
  async cleanup(): Promise<void> {
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;

    try {
      // Close the test pool first
      if (this.testPool) {
        await this.testPool.end().catch(() => {});
        this.testPool = null;
      }

      // Terminate all connections to the test database
      await this.adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
      `, [this.databaseName]).catch(() => {});

      // Small delay to ensure connections are terminated
      await new Promise(resolve => setTimeout(resolve, 100));

      // Drop the test database
      await this.adminPool.query(`DROP DATABASE IF EXISTS "${this.databaseName}"`);
    } finally {
      // Close admin pool
      await this.adminPool.end().catch(() => {});
    }
  }
}

/**
 * Cleanup manager for tracking and cleaning up all test databases
 * Used for emergency cleanup in case tests fail without proper cleanup
 */
export class TestDatabaseRegistry {
  private static databases: Set<TestDatabase> = new Set();

  static register(db: TestDatabase): void {
    this.databases.add(db);
  }

  static unregister(db: TestDatabase): void {
    this.databases.delete(db);
  }

  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.databases).map(db =>
      db.cleanup().catch(err => {
        console.error(`Failed to cleanup database ${db.getDatabaseName()}:`, err);
      })
    );
    await Promise.all(cleanupPromises);
    this.databases.clear();
  }
}

// Register cleanup on process exit
process.on('beforeExit', () => {
  TestDatabaseRegistry.cleanupAll().catch(console.error);
});

process.on('SIGINT', () => {
  TestDatabaseRegistry.cleanupAll().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  TestDatabaseRegistry.cleanupAll().then(() => process.exit(0)).catch(() => process.exit(1));
});
