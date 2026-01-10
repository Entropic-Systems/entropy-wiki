import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pagesRouter } from './routes/pages.js';
import { adminRouter } from './routes/admin.js';
import { closePool } from './db/client.js';

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/pages', pagesRouter);

// Admin routes (with auth middleware)
app.use('/admin', adminRouter);

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
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Entropy Wiki API running on port ${PORT}`);
  console.log(`CORS enabled for: ${corsOrigins.join(', ')}`);
});

export { app };
