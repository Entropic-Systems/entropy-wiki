import { Pool, PoolClient } from 'pg';

// Determine SSL settings
// Railway internal connections (*.railway.internal) don't use SSL
// External/proxy connections might need SSL
const dbUrl = process.env.DATABASE_URL || '';
const isInternalRailway = dbUrl.includes('.railway.internal');
const needsSsl = !isInternalRailway && (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT);

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

// Log connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
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
