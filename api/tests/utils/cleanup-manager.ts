/**
 * Cleanup Manager
 *
 * Provides robust cleanup mechanisms for test databases. Handles edge cases
 * like hanging connections, orphaned databases, and process exit cleanup.
 */

import pg from 'pg';

export interface CleanupConfig {
  /** Admin connection URL for database operations */
  adminUrl: string;
  /** Prefix for test database names (for pattern matching) */
  testDatabasePrefix?: string;
  /** Maximum age of test databases to clean up (milliseconds) */
  maxAge?: number;
  /** Force cleanup even if connections exist */
  force?: boolean;
  /** Log cleanup operations */
  verbose?: boolean;
}

export interface CleanupResult {
  success: boolean;
  databasesCleaned: string[];
  connectionsClosed: number;
  errors: string[];
  duration: number;
}

interface DatabaseInfo {
  datname: string;
  numbackends: number;
}

const DEFAULT_CONFIG: Partial<CleanupConfig> = {
  testDatabasePrefix: 'test_',
  maxAge: 60 * 60 * 1000, // 1 hour
  force: false,
  verbose: false,
};

/**
 * Manages cleanup of test databases and connections
 */
export class CleanupManager {
  private config: Required<CleanupConfig>;
  private adminPool: pg.Pool | null = null;

  constructor(config: CleanupConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<CleanupConfig>;
  }

  /**
   * Get admin pool, creating if needed
   */
  private async getAdminPool(): Promise<pg.Pool> {
    if (!this.adminPool) {
      const parsed = new URL(this.config.adminUrl);
      this.adminPool = new pg.Pool({
        user: parsed.username || 'postgres',
        password: parsed.password || '',
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port, 10) || 5432,
        database: parsed.pathname.slice(1) || 'postgres',
        max: 2,
        connectionTimeoutMillis: 10000,
      });
    }
    return this.adminPool;
  }

  /**
   * Close admin pool
   */
  async close(): Promise<void> {
    if (this.adminPool) {
      await this.adminPool.end();
      this.adminPool = null;
    }
  }

  /**
   * List all test databases
   */
  async listTestDatabases(): Promise<DatabaseInfo[]> {
    const pool = await this.getAdminPool();
    const result = await pool.query<DatabaseInfo>(`
      SELECT d.datname, (
        SELECT COUNT(*)::int FROM pg_stat_activity
        WHERE datname = d.datname
      ) as numbackends
      FROM pg_database d
      WHERE d.datname LIKE $1
      ORDER BY d.datname
    `, [`${this.config.testDatabasePrefix}%`]);

    return result.rows;
  }

  /**
   * Terminate all connections to a database
   */
  async terminateConnections(databaseName: string): Promise<number> {
    const pool = await this.getAdminPool();
    const result = await pool.query<{ terminated: boolean }>(`
      SELECT pg_terminate_backend(pid) as terminated
      FROM pg_stat_activity
      WHERE datname = $1
      AND pid <> pg_backend_pid()
    `, [databaseName]);

    return result.rowCount || 0;
  }

  /**
   * Drop a single test database
   */
  async dropDatabase(databaseName: string): Promise<boolean> {
    const pool = await this.getAdminPool();

    try {
      // Terminate connections first
      const terminated = await this.terminateConnections(databaseName);
      if (this.config.verbose && terminated > 0) {
        console.log(`  Terminated ${terminated} connections to ${databaseName}`);
      }

      // Small delay to allow connections to close
      await new Promise(resolve => setTimeout(resolve, 100));

      // Drop the database
      await pool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);

      if (this.config.verbose) {
        console.log(`  Dropped database: ${databaseName}`);
      }

      return true;
    } catch (error) {
      if (this.config.verbose) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`  Failed to drop ${databaseName}: ${msg}`);
      }
      return false;
    }
  }

  /**
   * Clean up orphaned test databases
   */
  async cleanupOrphanedDatabases(): Promise<CleanupResult> {
    const startTime = Date.now();
    const databasesCleaned: string[] = [];
    const errors: string[] = [];
    let connectionsClosed = 0;

    if (this.config.verbose) {
      console.log('Starting orphaned database cleanup...');
    }

    try {
      const databases = await this.listTestDatabases();

      for (const db of databases) {
        // Check if database has active connections
        if (db.numbackends > 0 && !this.config.force) {
          if (this.config.verbose) {
            console.log(`  Skipping ${db.datname}: ${db.numbackends} active connections`);
          }
          continue;
        }

        // Parse timestamp from database name (format: test_name_timestamp_random)
        const match = db.datname.match(/_(\d+)_[a-z0-9]+$/);
        if (match) {
          const timestamp = parseInt(match[1], 10);
          const age = Date.now() - timestamp;

          if (age < this.config.maxAge && !this.config.force) {
            if (this.config.verbose) {
              console.log(`  Skipping ${db.datname}: still within maxAge`);
            }
            continue;
          }
        }

        // Terminate connections
        const terminated = await this.terminateConnections(db.datname);
        connectionsClosed += terminated;

        // Drop database
        const dropped = await this.dropDatabase(db.datname);
        if (dropped) {
          databasesCleaned.push(db.datname);
        } else {
          errors.push(`Failed to drop database: ${db.datname}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Cleanup failed: ${msg}`);
    }

    return {
      success: errors.length === 0,
      databasesCleaned,
      connectionsClosed,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Clean up a specific database
   */
  async cleanupDatabase(databaseName: string): Promise<boolean> {
    const terminated = await this.terminateConnections(databaseName);
    if (this.config.verbose && terminated > 0) {
      console.log(`Terminated ${terminated} connections`);
    }

    return this.dropDatabase(databaseName);
  }

  /**
   * Force cleanup of all test databases (use with caution!)
   */
  async forceCleanupAll(): Promise<CleanupResult> {
    const originalForce = this.config.force;
    this.config.force = true;

    try {
      return await this.cleanupOrphanedDatabases();
    } finally {
      this.config.force = originalForce;
    }
  }

  /**
   * Get statistics about test databases
   */
  async getStats(): Promise<{
    totalDatabases: number;
    withConnections: number;
    orphaned: number;
    oldestTimestamp: number | null;
  }> {
    const databases = await this.listTestDatabases();
    let oldestTimestamp: number | null = null;

    for (const db of databases) {
      const match = db.datname.match(/_(\d+)_[a-z0-9]+$/);
      if (match) {
        const timestamp = parseInt(match[1], 10);
        if (oldestTimestamp === null || timestamp < oldestTimestamp) {
          oldestTimestamp = timestamp;
        }
      }
    }

    return {
      totalDatabases: databases.length,
      withConnections: databases.filter(d => d.numbackends > 0).length,
      orphaned: databases.filter(d => {
        const match = d.datname.match(/_(\d+)_[a-z0-9]+$/);
        if (match) {
          const age = Date.now() - parseInt(match[1], 10);
          return age > this.config.maxAge;
        }
        return false;
      }).length,
      oldestTimestamp,
    };
  }
}

/**
 * Global cleanup manager instance for process exit handling
 */
let globalCleanupManager: CleanupManager | null = null;
let globalCleanupDatabases: Set<string> = new Set();

/**
 * Register a database for cleanup on process exit
 */
export function registerForCleanup(databaseName: string): void {
  globalCleanupDatabases.add(databaseName);
}

/**
 * Unregister a database from cleanup (e.g., after successful cleanup)
 */
export function unregisterFromCleanup(databaseName: string): void {
  globalCleanupDatabases.delete(databaseName);
}

/**
 * Initialize global cleanup handler
 */
export function initializeGlobalCleanup(adminUrl: string): void {
  if (globalCleanupManager) {
    return; // Already initialized
  }

  globalCleanupManager = new CleanupManager({
    adminUrl,
    force: true,
    verbose: process.env.DEBUG === 'true',
  });

  // Handle process exit
  const cleanup = async () => {
    if (globalCleanupDatabases.size === 0) {
      return;
    }

    console.log(`Cleaning up ${globalCleanupDatabases.size} test database(s)...`);

    for (const dbName of globalCleanupDatabases) {
      try {
        await globalCleanupManager!.cleanupDatabase(dbName);
      } catch (error) {
        // Ignore errors during shutdown
      }
    }

    await globalCleanupManager!.close();
  };

  process.on('beforeExit', () => {
    cleanup().catch(console.error);
  });

  process.on('SIGINT', () => {
    cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
  });

  process.on('SIGTERM', () => {
    cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}

/**
 * Run cleanup as a standalone operation
 */
export async function runCleanup(config: CleanupConfig): Promise<CleanupResult> {
  const manager = new CleanupManager(config);
  try {
    return await manager.cleanupOrphanedDatabases();
  } finally {
    await manager.close();
  }
}
