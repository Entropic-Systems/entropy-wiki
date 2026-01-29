/**
 * Test Database Utilities
 *
 * Provides complete test database isolation infrastructure.
 *
 * @example Basic usage:
 * ```ts
 * import { useTestDatabase } from '../utils/index.js';
 *
 * describe('MyService', () => {
 *   const testDb = useTestDatabase('my-service');
 *
 *   beforeEach(async () => await testDb.setup());
 *   afterEach(async () => await testDb.teardown());
 *
 *   it('should work', async () => {
 *     const pool = testDb.getPool();
 *     // Use isolated database
 *   });
 * });
 * ```
 *
 * @example Functional style:
 * ```ts
 * import { withTestDatabase } from '../utils/index.js';
 *
 * it('should work', () => withTestDatabase('my-test', async (pool) => {
 *   await pool.query('SELECT 1');
 * }));
 * ```
 */

// Main hooks for test integration
export {
  useTestDatabase,
  useSharedTestDatabase,
  withTestDatabase,
  cleanupAllTestDatabases,
  type TestDatabaseHook,
} from './test-hooks.js';

// Core test database functionality
export {
  TestDatabase,
  TestDatabaseRegistry,
  type TestDatabaseConfig,
} from './test-database.js';

// Connection pool management
export {
  ManagedPool,
  PoolFactory,
  type PoolConfig,
} from './database-pool.js';

// Migration runner
export {
  MigrationRunner,
  runMigrations,
  resetAndMigrate,
  type MigrationResult,
  type MigrationRunResult,
  type MigrationRunnerConfig,
} from './migration-runner.js';

// Cleanup manager
export {
  CleanupManager,
  runCleanup,
  registerForCleanup,
  unregisterFromCleanup,
  initializeGlobalCleanup,
  type CleanupConfig,
  type CleanupResult,
} from './cleanup-manager.js';
