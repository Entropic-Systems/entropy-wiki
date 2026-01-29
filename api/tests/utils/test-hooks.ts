/**
 * Test Integration Hooks
 *
 * Provides easy-to-use beforeEach/afterEach hooks for test database isolation.
 * Compatible with Vitest and other test frameworks.
 *
 * @example
 * ```ts
 * import { describe, it, beforeEach, afterEach } from 'vitest';
 * import { useTestDatabase } from '../utils/test-hooks.js';
 *
 * describe('MyService', () => {
 *   const testDb = useTestDatabase('my-service');
 *
 *   beforeEach(async () => {
 *     await testDb.setup();
 *   });
 *
 *   afterEach(async () => {
 *     await testDb.teardown();
 *   });
 *
 *   it('should work with isolated database', async () => {
 *     const pool = testDb.getPool();
 *     // Your test code here
 *   });
 * });
 * ```
 */

import pg from 'pg';
import { TestDatabase, TestDatabaseConfig, TestDatabaseRegistry } from './test-database.js';
import { initializeGlobalCleanup, registerForCleanup, unregisterFromCleanup } from './cleanup-manager.js';

// Initialize global cleanup on module load
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres';
initializeGlobalCleanup(adminUrl);

export interface TestDatabaseHook {
  /** Set up a new isolated database for this test */
  setup(): Promise<void>;
  /** Tear down the isolated database */
  teardown(): Promise<void>;
  /** Get the database pool (only valid between setup and teardown) */
  getPool(): pg.Pool;
  /** Get the raw TestDatabase instance */
  getInstance(): TestDatabase | null;
  /** Get the database connection URL */
  getConnectionUrl(): string;
  /** Get the database name */
  getDatabaseName(): string;
}

/**
 * Create a test database hook for use in test suites
 *
 * @param testSuiteName - Name of the test suite (used for database naming)
 * @param config - Optional configuration
 * @returns Hook object with setup, teardown, and accessor methods
 */
export function useTestDatabase(
  testSuiteName: string,
  config?: TestDatabaseConfig
): TestDatabaseHook {
  let testDb: TestDatabase | null = null;
  let testCounter = 0;

  return {
    async setup(): Promise<void> {
      testCounter++;
      const testName = `${testSuiteName}_${testCounter}`;
      testDb = await TestDatabase.create(testName, config);
      TestDatabaseRegistry.register(testDb);
      registerForCleanup(testDb.getDatabaseName());
    },

    async teardown(): Promise<void> {
      if (testDb) {
        const dbName = testDb.getDatabaseName();
        TestDatabaseRegistry.unregister(testDb);
        await testDb.cleanup();
        unregisterFromCleanup(dbName);
        testDb = null;
      }
    },

    getPool(): pg.Pool {
      if (!testDb) {
        throw new Error('Test database not initialized. Call setup() first.');
      }
      return testDb.getPool();
    },

    getInstance(): TestDatabase | null {
      return testDb;
    },

    getConnectionUrl(): string {
      if (!testDb) {
        throw new Error('Test database not initialized. Call setup() first.');
      }
      return testDb.getConnectionUrl();
    },

    getDatabaseName(): string {
      if (!testDb) {
        throw new Error('Test database not initialized. Call setup() first.');
      }
      return testDb.getDatabaseName();
    },
  };
}

/**
 * Create a shared test database for a test suite (one database per describe block)
 *
 * @param testSuiteName - Name of the test suite
 * @param config - Optional configuration
 * @returns Hook object with setup, teardown, and accessor methods
 */
export function useSharedTestDatabase(
  testSuiteName: string,
  config?: TestDatabaseConfig
): TestDatabaseHook {
  let testDb: TestDatabase | null = null;
  let setupCount = 0;

  return {
    async setup(): Promise<void> {
      setupCount++;
      if (testDb) {
        // Already set up, just reset tables
        return;
      }

      testDb = await TestDatabase.create(testSuiteName, config);
      TestDatabaseRegistry.register(testDb);
      registerForCleanup(testDb.getDatabaseName());
    },

    async teardown(): Promise<void> {
      setupCount--;
      if (setupCount > 0) {
        // Other tests still using this database
        return;
      }

      if (testDb) {
        const dbName = testDb.getDatabaseName();
        TestDatabaseRegistry.unregister(testDb);
        await testDb.cleanup();
        unregisterFromCleanup(dbName);
        testDb = null;
      }
    },

    getPool(): pg.Pool {
      if (!testDb) {
        throw new Error('Test database not initialized. Call setup() first.');
      }
      return testDb.getPool();
    },

    getInstance(): TestDatabase | null {
      return testDb;
    },

    getConnectionUrl(): string {
      if (!testDb) {
        throw new Error('Test database not initialized. Call setup() first.');
      }
      return testDb.getConnectionUrl();
    },

    getDatabaseName(): string {
      if (!testDb) {
        throw new Error('Test database not initialized. Call setup() first.');
      }
      return testDb.getDatabaseName();
    },
  };
}

/**
 * Helper to run a test with an isolated database (functional style)
 *
 * @example
 * ```ts
 * import { withTestDatabase } from '../utils/test-hooks.js';
 *
 * it('should work', () => withTestDatabase('my-test', async (pool) => {
 *   await pool.query('SELECT 1');
 * }));
 * ```
 */
export async function withTestDatabase<T>(
  testName: string,
  callback: (pool: pg.Pool, db: TestDatabase) => Promise<T>,
  config?: TestDatabaseConfig
): Promise<T> {
  const testDb = await TestDatabase.create(testName, config);
  TestDatabaseRegistry.register(testDb);
  registerForCleanup(testDb.getDatabaseName());

  try {
    return await callback(testDb.getPool(), testDb);
  } finally {
    const dbName = testDb.getDatabaseName();
    TestDatabaseRegistry.unregister(testDb);
    await testDb.cleanup();
    unregisterFromCleanup(dbName);
  }
}

/**
 * Clean up all test databases (use in globalTeardown)
 */
export async function cleanupAllTestDatabases(): Promise<void> {
  await TestDatabaseRegistry.cleanupAll();
}

// Re-export commonly used types and classes
export { TestDatabase, TestDatabaseConfig, TestDatabaseRegistry } from './test-database.js';
export { ManagedPool, PoolFactory } from './database-pool.js';
export { MigrationRunner, runMigrations, resetAndMigrate } from './migration-runner.js';
export { CleanupManager, runCleanup } from './cleanup-manager.js';
