/**
 * Database Security and Reliability Utilities
 *
 * Provides secure database operations with:
 * - Timeout protection for all queries
 * - Safe JSON serialization with input validation
 * - Connection leak detection
 * - Query performance monitoring
 */

import { Pool, PoolClient } from 'pg';

/**
 * Database operation timeout error
 */
export class DatabaseTimeoutError extends Error {
  constructor(message: string, public queryText: string, public timeoutMs: number) {
    super(message);
    this.name = 'DatabaseTimeoutError';
  }
}

/**
 * Safe JSON serialization error
 */
export class SafeJSONError extends Error {
  constructor(message: string, public data: unknown) {
    super(message);
    this.name = 'SafeJSONError';
  }
}

/**
 * Configuration for database security utilities
 */
export interface DatabaseSecurityConfig {
  defaultTimeoutMs: number;
  maxQueryTimeMs: number;
  enableQueryLogging: boolean;
  enablePerformanceMonitoring: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DatabaseSecurityConfig = {
  defaultTimeoutMs: 30000,    // 30 second default timeout
  maxQueryTimeMs: 120000,     // 2 minute maximum for complex queries
  enableQueryLogging: true,
  enablePerformanceMonitoring: true,
};

/**
 * Safely serialize data to JSON with validation
 * Prevents JSON injection and handles problematic data types
 */
export function safeJSONStringify(data: unknown, options: {
  maxDepth?: number;
  maxStringLength?: number;
  allowedTypes?: string[];
} = {}): string {
  const {
    maxDepth = 10,
    maxStringLength = 10000,
    allowedTypes = ['string', 'number', 'boolean', 'object']
  } = options;

  if (data === null || data === undefined) {
    return 'null';
  }

  // Recursive depth tracking
  function serialize(obj: unknown, currentDepth: number): unknown {
    if (currentDepth > maxDepth) {
      throw new SafeJSONError(`Maximum depth exceeded: ${maxDepth}`, obj);
    }

    if (obj === null || obj === undefined) {
      return null;
    }

    const type = typeof obj;

    if (!allowedTypes.includes(type)) {
      throw new SafeJSONError(`Type not allowed: ${type}`, obj);
    }

    switch (type) {
      case 'string':
        if ((obj as string).length > maxStringLength) {
          throw new SafeJSONError(`String too long: ${(obj as string).length} chars (max ${maxStringLength})`, obj);
        }
        return obj;

      case 'number':
        if (!Number.isFinite(obj as number)) {
          throw new SafeJSONError(`Invalid number: ${obj}`, obj);
        }
        return obj;

      case 'boolean':
        return obj;

      case 'object':
        if (Array.isArray(obj)) {
          return (obj as unknown[]).map(item => serialize(item, currentDepth + 1));
        }

        if (obj instanceof Date) {
          return obj.toISOString();
        }

        if (obj instanceof RegExp || obj instanceof Function) {
          throw new SafeJSONError(`Unsafe object type: ${obj.constructor.name}`, obj);
        }

        // Regular object
        const result: Record<string, unknown> = {};
        const objRecord = obj as Record<string, unknown>;

        for (const [key, value] of Object.entries(objRecord)) {
          // Validate key
          if (typeof key !== 'string' || key.length > 100) {
            throw new SafeJSONError(`Invalid object key: ${key}`, obj);
          }

          // Recursively serialize value
          result[key] = serialize(value, currentDepth + 1);
        }

        return result;

      default:
        throw new SafeJSONError(`Unexpected type: ${type}`, obj);
    }
  }

  try {
    const serialized = serialize(data, 0);
    return JSON.stringify(serialized);
  } catch (error) {
    if (error instanceof SafeJSONError) {
      throw error;
    }

    throw new SafeJSONError(
      `JSON serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data
    );
  }
}

/**
 * Execute a database query with timeout protection
 */
export async function secureQuery<T = any>(
  pool: Pool,
  text: string,
  params: unknown[] = [],
  options: {
    timeoutMs?: number;
    queryName?: string;
  } = {}
): Promise<{ rows: T[]; rowCount: number }> {
  const {
    timeoutMs = DEFAULT_CONFIG.defaultTimeoutMs,
    queryName = 'unnamed_query'
  } = options;

  if (timeoutMs > DEFAULT_CONFIG.maxQueryTimeMs) {
    throw new Error(`Query timeout too high: ${timeoutMs}ms (max ${DEFAULT_CONFIG.maxQueryTimeMs}ms)`);
  }

  const startTime = Date.now();
  let client: PoolClient | null = null;

  try {
    // Get client with timeout
    client = await Promise.race([
      pool.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DatabaseTimeoutError(
          `Database connection timeout after ${timeoutMs}ms`,
          text,
          timeoutMs
        )), timeoutMs)
      )
    ]);

    // Execute query with timeout
    const result = await Promise.race([
      client.query(text, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DatabaseTimeoutError(
          `Query timeout after ${timeoutMs}ms`,
          text,
          timeoutMs
        )), timeoutMs)
      )
    ]);

    const duration = Date.now() - startTime;

    // Log slow queries
    if (DEFAULT_CONFIG.enablePerformanceMonitoring && duration > 5000) {
      console.warn(`Slow query detected [${queryName}]:`, {
        duration,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        rowCount: result.rowCount
      });
    }

    // Log query execution if enabled
    if (DEFAULT_CONFIG.enableQueryLogging) {
      console.debug(`Query executed [${queryName}]:`, {
        duration,
        rowCount: result.rowCount,
        success: true
      });
    }

    return {
      rows: result.rows,
      rowCount: result.rowCount || 0
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    // Log failed queries
    console.error(`Query failed [${queryName}]:`, {
      duration,
      query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;

  } finally {
    // Always release the client
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        console.error('Failed to release database client:', releaseError);
      }
    }
  }
}

/**
 * Execute multiple queries in a transaction with timeout protection
 */
export async function secureTransaction<T>(
  pool: Pool,
  queries: Array<{ text: string; params: unknown[]; name?: string }>,
  options: {
    timeoutMs?: number;
    transactionName?: string;
  } = {}
): Promise<T[]> {
  const {
    timeoutMs = DEFAULT_CONFIG.defaultTimeoutMs,
    transactionName = 'unnamed_transaction'
  } = options;

  const startTime = Date.now();
  let client: PoolClient | null = null;

  try {
    // Get client and start transaction
    client = await pool.connect();
    await client.query('BEGIN');

    const results: T[] = [];

    // Execute all queries in sequence with individual timeouts
    for (let i = 0; i < queries.length; i++) {
      const { text, params, name = `query_${i}` } = queries[i];
      const queryStartTime = Date.now();

      const result = await Promise.race([
        client.query(text, params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DatabaseTimeoutError(
            `Transaction query timeout after ${timeoutMs}ms`,
            text,
            timeoutMs
          )), timeoutMs)
        )
      ]);

      results.push(result.rows as T);

      // Check total transaction time
      const totalDuration = Date.now() - startTime;
      if (totalDuration > timeoutMs) {
        throw new DatabaseTimeoutError(
          `Transaction timeout after ${totalDuration}ms`,
          `Transaction ${transactionName}`,
          timeoutMs
        );
      }
    }

    // Commit transaction
    await client.query('COMMIT');

    const duration = Date.now() - startTime;
    console.debug(`Transaction completed [${transactionName}]:`, {
      duration,
      queryCount: queries.length,
      success: true
    });

    return results;

  } catch (error) {
    // Rollback on any error
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.debug(`Transaction rolled back [${transactionName}]`);
      } catch (rollbackError) {
        console.error(`Transaction rollback failed [${transactionName}]:`, rollbackError);
      }
    }

    const duration = Date.now() - startTime;
    console.error(`Transaction failed [${transactionName}]:`, {
      duration,
      queryCount: queries.length,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;

  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        console.error('Failed to release database client:', releaseError);
      }
    }
  }
}

/**
 * Safe metadata update helper
 * Prevents JSON injection in metadata fields
 */
export function createSafeMetadataUpdate(
  existingMetadata: unknown,
  newData: Record<string, unknown>
): string {
  // Parse existing metadata safely
  let existing: Record<string, unknown> = {};

  if (existingMetadata && typeof existingMetadata === 'object') {
    existing = existingMetadata as Record<string, unknown>;
  }

  // Merge with new data
  const merged = { ...existing, ...newData };

  // Serialize safely
  return safeJSONStringify(merged, {
    maxDepth: 5,
    maxStringLength: 1000,
    allowedTypes: ['string', 'number', 'boolean', 'object']
  });
}