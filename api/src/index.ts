import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pagesRouter } from './routes/pages.js';
import { adminRouter } from './routes/admin.js';
import { ingestRouter } from './routes/ingest.js';
import searchRouter from './routes/search.js';
import categoriesRouter from './routes/categories.js';
import { closePool, query } from './db/client.js';
import { startProcessor, stopProcessor } from './services/processor.js';
import { getAdminPasswordHash, comparePassword } from './utils/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Parse allowed origins from env
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:3000'];

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json());

// Rate limiting (skip in test mode)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const result = await query('SELECT 1 as test, NOW() as time');
    res.json({
      status: 'ok',
      database: 'connected',
      result: result.rows[0],
      dbUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
      code: err.code,
      dbUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')
    });
  }
});

// Migration endpoint (protected by admin password)
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

app.post('/admin/migrate', async (req: Request, res: Response) => {
  const password = req.headers['x-admin-password'] as string;
  if (!password) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const adminPasswordHash = await getAdminPasswordHash();
    const isValid = await comparePassword(password, adminPasswordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  } catch (authErr) {
    console.error('Auth configuration error:', authErr);
    return res.status(500).json({ error: 'config_error', message: 'Server not configured for admin access' });
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(__dirname, 'db', 'migrations');
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    const results: string[] = [];

    for (const file of files) {
      const migrationName = file.replace('.sql', '');

      // Check if already applied
      try {
        const check = await query('SELECT 1 FROM _migrations WHERE name = $1', [migrationName]);
        if (check.rows.length > 0) {
          results.push(`Skipped ${migrationName} (already applied)`);
          continue;
        }
      } catch (err: any) {
        if (err.code !== '42P01') throw err; // Table doesn't exist yet
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      // Validate migration SQL - only allow safe DDL/DML operations
      const sqlLower = sql.toLowerCase();
      const dangerousPatterns = [
        /;\s*drop\s+database/i,
        /;\s*create\s+database/i,
        /;\s*alter\s+database/i,
        /;\s*grant\s+/i,
        /;\s*revoke\s+/i,
        /;\s*create\s+user/i,
        /;\s*alter\s+user/i,
        /;\s*drop\s+user/i,
        /copy\s+.*\s+from\s+program/i,
        /pg_read_file/i,
        /pg_ls_dir/i,
        /lo_import/i,
        /lo_export/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(sql)) {
          throw new Error(`Migration ${migrationName} contains potentially dangerous SQL operations`);
        }
      }

      // Execute within a transaction for safety
      await query('BEGIN');
      try {
        await query(sql);
        // Record migration as applied
        await query('INSERT INTO _migrations (name, applied_at) VALUES ($1, NOW()) ON CONFLICT (name) DO NOTHING', [migrationName]);
        await query('COMMIT');
        results.push(`Applied ${migrationName}`);
      } catch (migrationErr) {
        await query('ROLLBACK');
        throw migrationErr;
      }
    }

    res.json({ status: 'ok', migrations: results });
  } catch (err: any) {
    res.status(500).json({ error: 'migration_failed', message: err.message });
  }
});

// Public routes
app.use('/pages', pagesRouter);
app.use('/search', searchRouter);
app.use('/categories', categoriesRouter);

// Admin routes (with auth middleware)
app.use('/admin', adminRouter);

// Ingest routes (with auth middleware)
app.use('/admin/ingest', ingestRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopProcessor();
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  stopProcessor();
  await closePool();
  process.exit(0);
});

// Only start the server when not in test mode
// (supertest handles server creation for tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Entropy Wiki API running on port ${PORT}`);
    console.log(`CORS enabled for: ${corsOrigins.join(', ')}`);

    // Start background job processor
    if (process.env.ENABLE_INGEST_PROCESSOR !== 'false') {
      startProcessor();
    }
  });
}

export { app };
