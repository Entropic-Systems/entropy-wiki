/**
 * Railway Database Health Collector
 *
 * Monitors Railway PostgreSQL health and performance:
 * - Connection pool status
 * - Query performance and slow queries
 * - Database health metrics
 * - Migration status tracking
 *
 * Combines Railway API data with direct database queries.
 *
 * Bead: entropy-wiki-2fk
 */

import {
  Collector,
  CollectorResult,
  CollectorConfig,
  CollectorError,
  HealthMetrics,
  DependencyStatus,
  HealthStatus,
  ErrorSeverity,
  ErrorCategory,
  DEFAULT_COLLECTOR_CONFIG,
  generateErrorId,
  determineHealthStatus,
  sanitizeError,
} from './types.js';

// Railway database-specific configuration
interface RailwayDbConfig extends CollectorConfig {
  slowQueryThresholdMs: number;
  connectionPoolWarningThreshold: number;
}

const DEFAULT_DB_CONFIG: RailwayDbConfig = {
  ...DEFAULT_COLLECTOR_CONFIG,
  slowQueryThresholdMs: 1000, // 1 second
  connectionPoolWarningThreshold: 80, // 80% pool utilization warning
};

// Database health metrics from pg_stat_* views
interface DbStatistics {
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  databaseSize: string;
  cacheHitRatio: number;
  transactionsCommitted: number;
  transactionsRolledBack: number;
  deadlocks: number;
  blockedQueries: number;
}

// Migration status
interface MigrationStatus {
  name: string;
  appliedAt: string;
}

// Slow query info
interface SlowQuery {
  queryStart: string;
  duration: number;
  state: string;
  query: string;
  waitEvent?: string;
}

export class RailwayDbCollector implements Collector {
  public readonly name = 'railway-database';

  private databaseUrl: string;
  private config: RailwayDbConfig;

  constructor(config?: Partial<RailwayDbConfig>) {
    this.databaseUrl = process.env.DATABASE_URL || '';
    this.config = { ...DEFAULT_DB_CONFIG, ...config };
  }

  /**
   * Check if collector is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.databaseUrl);
  }

  /**
   * Quick health check - simple connectivity test
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.isConfigured()) {
      return 'unknown';
    }

    try {
      // Use the API's /health/db endpoint for quick check
      const apiUrl = process.env.API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/health/db`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json() as { database: string };
        return data.database === 'connected' ? 'healthy' : 'unhealthy';
      }

      return 'unhealthy';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Collect comprehensive database health data
   */
  async collect(config?: Partial<RailwayDbConfig>): Promise<CollectorResult> {
    const mergedConfig: RailwayDbConfig = { ...this.config, ...config };
    const startTime = Date.now();
    const collectedAt = new Date().toISOString();

    const errors: CollectorError[] = [];
    const metrics: HealthMetrics[] = [];
    const dependencies: DependencyStatus[] = [];
    const rawData: Record<string, unknown> = {};

    // Check if configured
    if (!this.isConfigured()) {
      return {
        collector: this.name,
        status: 'unknown',
        collectedAt,
        durationMs: Date.now() - startTime,
        errors: [{
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'warning',
          category: 'configuration',
          message: 'Railway database collector not configured: missing DATABASE_URL',
          source: this.name,
        }],
        metrics: [],
        dependencies: [],
        summary: {
          totalErrors: 1,
          criticalErrors: 0,
          avgResponseTimeMs: 0,
        },
      };
    }

    let criticalErrors = 0;
    let totalResponseTime = 0;
    let successfulChecks = 0;

    // Dynamically import pg to avoid initialization errors when not configured
    let pg: typeof import('pg') | null = null;
    let pool: InstanceType<typeof import('pg').Pool> | null = null;

    try {
      pg = await import('pg');
      pool = new pg.Pool({
        connectionString: this.databaseUrl,
        connectionTimeoutMillis: mergedConfig.timeoutMs,
        max: 1, // Only need one connection for health checks
      });

      // Test basic connectivity
      const connectStart = Date.now();
      try {
        const connectResult = await pool.query('SELECT NOW() as time, current_database() as db');
        const connectLatency = Date.now() - connectStart;
        totalResponseTime += connectLatency;
        successfulChecks++;

        metrics.push({
          responseTimeMs: connectLatency,
          statusCode: 200,
          success: true,
          timestamp: collectedAt,
        });

        dependencies.push({
          name: 'postgresql-connection',
          status: 'healthy',
          latencyMs: connectLatency,
          lastChecked: collectedAt,
          message: `Connected to ${connectResult.rows[0].db}`,
          details: { serverTime: connectResult.rows[0].time },
        });
      } catch (err) {
        const connectLatency = Date.now() - connectStart;
        totalResponseTime += connectLatency;

        errors.push({
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'critical',
          category: 'database',
          message: `Database connection failed: ${sanitizeError(err instanceof Error ? err.message : String(err))}`,
          source: `${this.name}:connection`,
        });
        criticalErrors++;

        metrics.push({
          responseTimeMs: connectLatency,
          statusCode: 0,
          success: false,
          timestamp: collectedAt,
        });

        dependencies.push({
          name: 'postgresql-connection',
          status: 'unhealthy',
          latencyMs: connectLatency,
          lastChecked: collectedAt,
          message: sanitizeError(err instanceof Error ? err.message : 'Connection failed'),
        });

        // Can't continue without database connection
        return {
          collector: this.name,
          status: 'unhealthy',
          collectedAt,
          durationMs: Date.now() - startTime,
          errors,
          metrics,
          dependencies,
          summary: {
            totalErrors: errors.length,
            criticalErrors,
            avgResponseTimeMs: totalResponseTime,
          },
        };
      }

      // Collect database statistics
      const statsStart = Date.now();
      try {
        const stats = await this.collectDatabaseStats(pool);
        const statsLatency = Date.now() - statsStart;
        totalResponseTime += statsLatency;
        successfulChecks++;
        rawData.statistics = stats;

        metrics.push({
          responseTimeMs: statsLatency,
          statusCode: 200,
          success: true,
          timestamp: collectedAt,
        });

        // Check connection pool utilization
        const poolUtilization = stats.maxConnections > 0
          ? ((stats.activeConnections + stats.idleConnections) / stats.maxConnections) * 100
          : 0;

        if (poolUtilization > mergedConfig.connectionPoolWarningThreshold) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'warning',
            category: 'database',
            message: `High connection pool utilization: ${poolUtilization.toFixed(1)}%`,
            source: `${this.name}:pool`,
            details: {
              active: stats.activeConnections,
              idle: stats.idleConnections,
              max: stats.maxConnections,
            },
          });
        }

        dependencies.push({
          name: 'postgresql-pool',
          status: poolUtilization > mergedConfig.connectionPoolWarningThreshold ? 'degraded' : 'healthy',
          latencyMs: statsLatency,
          lastChecked: collectedAt,
          message: `Pool: ${stats.activeConnections} active, ${stats.idleConnections} idle of ${stats.maxConnections} max`,
          details: {
            utilization: poolUtilization,
            cacheHitRatio: stats.cacheHitRatio,
            deadlocks: stats.deadlocks,
          },
        });

        // Check cache hit ratio
        if (stats.cacheHitRatio < 0.9) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'warning',
            category: 'database',
            message: `Low cache hit ratio: ${(stats.cacheHitRatio * 100).toFixed(1)}%`,
            source: `${this.name}:cache`,
            details: { cacheHitRatio: stats.cacheHitRatio },
          });
        }

        // Check deadlocks
        if (stats.deadlocks > 0) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'warning',
            category: 'database',
            message: `Deadlocks detected: ${stats.deadlocks}`,
            source: `${this.name}:deadlocks`,
            details: { count: stats.deadlocks },
          });
        }

        // Check blocked queries
        if (stats.blockedQueries > 0) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'warning',
            category: 'database',
            message: `Blocked queries detected: ${stats.blockedQueries}`,
            source: `${this.name}:blocking`,
            details: { count: stats.blockedQueries },
          });
        }
      } catch (err) {
        const statsLatency = Date.now() - statsStart;
        totalResponseTime += statsLatency;

        errors.push({
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'error',
          category: 'database',
          message: `Failed to collect database statistics: ${sanitizeError(err instanceof Error ? err.message : String(err))}`,
          source: `${this.name}:stats`,
        });

        metrics.push({
          responseTimeMs: statsLatency,
          statusCode: 500,
          success: false,
          timestamp: collectedAt,
        });
      }

      // Check for slow queries
      const slowQueryStart = Date.now();
      try {
        const slowQueries = await this.findSlowQueries(pool, mergedConfig.slowQueryThresholdMs);
        const slowQueryLatency = Date.now() - slowQueryStart;
        totalResponseTime += slowQueryLatency;
        successfulChecks++;
        rawData.slowQueries = slowQueries;

        if (slowQueries.length > 0) {
          for (const query of slowQueries.slice(0, 5)) {
            errors.push({
              id: generateErrorId(this.name),
              timestamp: query.queryStart,
              severity: query.duration > mergedConfig.slowQueryThresholdMs * 5 ? 'error' : 'warning',
              category: 'database',
              message: `Slow query detected (${(query.duration / 1000).toFixed(1)}s): ${query.query.substring(0, 100)}...`,
              source: `${this.name}:slow_query`,
              details: {
                duration: query.duration,
                state: query.state,
                waitEvent: query.waitEvent,
              },
            });
          }
        }

        metrics.push({
          responseTimeMs: slowQueryLatency,
          statusCode: 200,
          success: true,
          timestamp: collectedAt,
        });
      } catch (err) {
        const slowQueryLatency = Date.now() - slowQueryStart;
        totalResponseTime += slowQueryLatency;

        // Not critical if slow query check fails, but log it
        errors.push({
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'warning',
          category: 'database',
          message: `Failed to check slow queries: ${sanitizeError(err instanceof Error ? err.message : String(err))}`,
          source: `${this.name}:slow_query`,
        });

        metrics.push({
          responseTimeMs: slowQueryLatency,
          statusCode: 500,
          success: false,
          timestamp: collectedAt,
        });
      }

      // Check migration status
      const migrationsStart = Date.now();
      try {
        const migrations = await this.checkMigrations(pool);
        const migrationsLatency = Date.now() - migrationsStart;
        totalResponseTime += migrationsLatency;
        successfulChecks++;
        rawData.migrations = migrations;

        dependencies.push({
          name: 'database-migrations',
          status: 'healthy',
          latencyMs: migrationsLatency,
          lastChecked: collectedAt,
          message: `${migrations.length} migrations applied`,
          details: { latestMigration: migrations[0]?.name },
        });

        metrics.push({
          responseTimeMs: migrationsLatency,
          statusCode: 200,
          success: true,
          timestamp: collectedAt,
        });
      } catch (err) {
        const migrationsLatency = Date.now() - migrationsStart;
        totalResponseTime += migrationsLatency;

        // Migrations table might not exist, not critical but log it
        errors.push({
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'info',
          category: 'database',
          message: `Could not check migrations (table may not exist): ${sanitizeError(err instanceof Error ? err.message : String(err))}`,
          source: `${this.name}:migrations`,
        });

        metrics.push({
          responseTimeMs: migrationsLatency,
          statusCode: 404,
          success: false,
          timestamp: collectedAt,
        });
      }

    } finally {
      // Clean up connection pool
      if (pool) {
        await pool.end().catch((err) => {
          console.error('Failed to close database pool:', sanitizeError(err instanceof Error ? err.message : String(err)));
        });
      }
    }

    const durationMs = Date.now() - startTime;
    const totalChecks = metrics.length;
    const successRate = totalChecks > 0 ? successfulChecks / totalChecks : 0;

    return {
      collector: this.name,
      status: determineHealthStatus(criticalErrors, errors.length, successRate),
      collectedAt,
      durationMs,
      errors,
      metrics,
      dependencies,
      summary: {
        totalErrors: errors.length,
        criticalErrors,
        avgResponseTimeMs: totalChecks > 0 ? Math.round(totalResponseTime / totalChecks) : 0,
        uptime: successRate * 100,
      },
      raw: rawData,
    };
  }

  /**
   * Collect database statistics from pg_stat views
   */
  private async collectDatabaseStats(pool: InstanceType<typeof import('pg').Pool>): Promise<DbStatistics> {
    const queryTimeout = 10000; // 10 second timeout per query

    // Get connection counts
    const connectionsResult = await this.queryWithTimeout<{ rows: Array<Record<string, string>> }>(
      pool,
      `SELECT
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE state LIKE 'idle in transaction%') as idle_in_transaction,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      FROM pg_stat_activity
      WHERE datname = current_database()`,
      [],
      queryTimeout
    );

    // Get database stats
    const dbStatsResult = await this.queryWithTimeout<{ rows: Array<Record<string, string>> }>(
      pool,
      `SELECT
        pg_database_size(current_database()) as db_size,
        xact_commit as commits,
        xact_rollback as rollbacks,
        deadlocks,
        blks_hit,
        blks_read
      FROM pg_stat_database
      WHERE datname = current_database()`,
      [],
      queryTimeout
    );

    // Get blocked queries count
    const blockedResult = await this.queryWithTimeout<{ rows: Array<Record<string, string>> }>(
      pool,
      `SELECT count(*) as blocked
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND datname = current_database()`,
      [],
      queryTimeout
    );

    const conns = connectionsResult.rows[0];
    const stats = dbStatsResult.rows[0];
    const blocked = blockedResult.rows[0];

    // Calculate cache hit ratio
    const blksHit = parseInt(stats.blks_hit, 10) || 0;
    const blksRead = parseInt(stats.blks_read, 10) || 0;
    const cacheHitRatio = blksHit + blksRead > 0
      ? blksHit / (blksHit + blksRead)
      : 1;

    return {
      activeConnections: parseInt(conns.active, 10) || 0,
      idleConnections: parseInt(conns.idle, 10) || 0,
      maxConnections: parseInt(conns.max_connections, 10) || 100,
      databaseSize: this.formatBytes(parseInt(stats.db_size, 10) || 0),
      cacheHitRatio,
      transactionsCommitted: parseInt(stats.commits, 10) || 0,
      transactionsRolledBack: parseInt(stats.rollbacks, 10) || 0,
      deadlocks: parseInt(stats.deadlocks, 10) || 0,
      blockedQueries: parseInt(blocked.blocked, 10) || 0,
    };
  }

  /**
   * Find slow-running queries
   */
  private async findSlowQueries(
    pool: InstanceType<typeof import('pg').Pool>,
    thresholdMs: number
  ): Promise<SlowQuery[]> {
    const result = await this.queryWithTimeout<{ rows: Array<Record<string, unknown>> }>(
      pool,
      `SELECT
        query_start,
        EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000 as duration_ms,
        state,
        query,
        wait_event
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND query NOT LIKE '%pg_stat_activity%'
        AND datname = current_database()
        AND EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000 > $1
      ORDER BY query_start ASC
      LIMIT 10`,
      [thresholdMs],
      10000
    );

    return result.rows.map(row => ({
      queryStart: String(row.query_start),
      duration: parseFloat(String(row.duration_ms)),
      state: String(row.state),
      query: String(row.query),
      waitEvent: row.wait_event ? String(row.wait_event) : undefined,
    }));
  }

  /**
   * Check migration status
   */
  private async checkMigrations(
    pool: InstanceType<typeof import('pg').Pool>
  ): Promise<MigrationStatus[]> {
    const result = await this.queryWithTimeout<{ rows: Array<Record<string, unknown>> }>(
      pool,
      `SELECT name, applied_at
      FROM _migrations
      ORDER BY applied_at DESC
      LIMIT 10`,
      [],
      10000
    );

    return result.rows.map(row => ({
      name: String(row.name),
      appliedAt: String(row.applied_at),
    }));
  }

  /**
   * Execute a query with timeout to prevent indefinite blocking
   */
  private async queryWithTimeout<T>(
    pool: InstanceType<typeof import('pg').Pool>,
    sql: string,
    params: unknown[] = [],
    timeoutMs: number = 10000
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    const queryPromise = params.length > 0
      ? pool.query(sql, params)
      : pool.query(sql);

    return Promise.race([queryPromise, timeoutPromise]) as Promise<T>;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Export singleton instance
export const railwayDbCollector = new RailwayDbCollector();

// Export factory function
export function createRailwayDbCollector(
  config?: Partial<RailwayDbConfig>
): RailwayDbCollector {
  return new RailwayDbCollector(config);
}
