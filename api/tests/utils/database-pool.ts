/**
 * Database Pool Manager
 *
 * Provides efficient connection pool management for test databases.
 * Supports connection reuse within test suites while maintaining isolation.
 */

import pg from 'pg';

export interface PoolConfig {
  /** Maximum number of clients in the pool */
  max?: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMillis?: number;
  /** Idle timeout in milliseconds */
  idleTimeoutMillis?: number;
  /** Statement timeout in milliseconds */
  statementTimeoutMs?: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  statementTimeoutMs: 30000,
};

/**
 * Managed database pool with automatic cleanup
 */
export class ManagedPool {
  private pool: pg.Pool;
  private isEnded = false;
  private activeClients = 0;
  private config: pg.PoolConfig;

  constructor(config: pg.PoolConfig) {
    this.config = config;
    this.pool = new pg.Pool(config);

    // Track connections
    this.pool.on('connect', () => {
      this.activeClients++;
    });

    this.pool.on('remove', () => {
      this.activeClients--;
    });

    this.pool.on('error', (err) => {
      console.error('Pool error:', err);
    });
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<pg.PoolClient> {
    if (this.isEnded) {
      throw new Error('Pool has been ended');
    }
    return this.pool.connect();
  }

  /**
   * Execute a query
   */
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    if (this.isEnded) {
      throw new Error('Pool has been ended');
    }
    return this.pool.query<T>(sql, params);
  }

  /**
   * Execute a query with timeout
   */
  async queryWithTimeout<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
    timeoutMs: number = 30000
  ): Promise<pg.QueryResult<T>> {
    const client = await this.getClient();
    try {
      // Set statement timeout
      await client.query(`SET statement_timeout = ${timeoutMs}`);
      const result = await client.query<T>(sql, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    activeClients: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      activeClients: this.activeClients,
    };
  }

  /**
   * Check if the pool is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health_check');
      return result.rows[0]?.health_check === 1;
    } catch {
      return false;
    }
  }

  /**
   * End the pool
   */
  async end(): Promise<void> {
    if (this.isEnded) return;
    this.isEnded = true;
    await this.pool.end();
  }

  /**
   * Check if pool is ended
   */
  hasEnded(): boolean {
    return this.isEnded;
  }

  /**
   * Get the underlying pg.Pool (use with caution)
   */
  getUnderlyingPool(): pg.Pool {
    return this.pool;
  }
}

/**
 * Pool factory for creating managed pools
 */
export class PoolFactory {
  private static pools: Map<string, ManagedPool> = new Map();

  /**
   * Create a new managed pool
   */
  static create(connectionUrl: string, config: PoolConfig = {}): ManagedPool {
    const mergedConfig = { ...DEFAULT_POOL_CONFIG, ...config };

    const parsed = new URL(connectionUrl);
    const poolConfig: pg.PoolConfig = {
      user: parsed.username,
      password: parsed.password,
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 5432,
      database: parsed.pathname.slice(1),
      max: mergedConfig.max,
      connectionTimeoutMillis: mergedConfig.connectionTimeoutMillis,
      idleTimeoutMillis: mergedConfig.idleTimeoutMillis,
    };

    const pool = new ManagedPool(poolConfig);
    this.pools.set(connectionUrl, pool);
    return pool;
  }

  /**
   * Get an existing pool or create a new one
   */
  static getOrCreate(connectionUrl: string, config: PoolConfig = {}): ManagedPool {
    const existing = this.pools.get(connectionUrl);
    if (existing && !existing.hasEnded()) {
      return existing;
    }
    return this.create(connectionUrl, config);
  }

  /**
   * Close a specific pool
   */
  static async close(connectionUrl: string): Promise<void> {
    const pool = this.pools.get(connectionUrl);
    if (pool) {
      await pool.end();
      this.pools.delete(connectionUrl);
    }
  }

  /**
   * Close all pools
   */
  static async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(pool =>
      pool.end().catch(err => console.error('Error closing pool:', err))
    );
    await Promise.all(closePromises);
    this.pools.clear();
  }

  /**
   * Get all active pools
   */
  static getActivePools(): string[] {
    return Array.from(this.pools.entries())
      .filter(([_, pool]) => !pool.hasEnded())
      .map(([url]) => url);
  }
}

// Cleanup on process exit
process.on('beforeExit', () => {
  PoolFactory.closeAll().catch(console.error);
});
