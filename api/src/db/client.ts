import { Pool, PoolClient } from 'pg';

// Log database configuration on startup
const dbUrl = process.env.DATABASE_URL || '';
console.log('Database config:', {
  hasUrl: !!dbUrl,
  host: dbUrl.match(/@([^:\/]+)/)?.[1] || 'unknown',
  isInternal: dbUrl.includes('.railway.internal'),
});

// Create connection pool - no SSL for Railway internal connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Don't use SSL for internal Railway connections
  ssl: false,
});

// Log connection errors but don't exit
pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

// Query helper
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.slice(0, 100), duration, rows: result.rowCount });
  }

  return result;
}

// Get a client for transactions
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
