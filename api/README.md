# Entropy Wiki API

Express.js API backend for the Entropy Wiki with PostgreSQL storage.

## Overview

This API provides a database-backed content management system for the Entropy Wiki. It enables:

- **Dynamic page management** via Admin UI at `/admin`
- **Draft/Published workflow** with visibility controls
- **Revision tracking** for all content changes
- **Graceful degradation** - frontend falls back to filesystem if API unavailable

## Current State

| Feature | Status | Notes |
|---------|--------|-------|
| CRUD Endpoints | ✅ Working | Create, read, update, delete pages |
| Auth Middleware | ✅ Working | Single admin password via header |
| PostgreSQL Storage | ✅ Working | Pages + revisions with FK constraints |
| Markdown Import | ✅ Working | `npm run db:seed` imports wiki/*.md |
| Railway Deployment | 🔧 Ready | Configured, needs ADMIN_PASSWORD |

## Production Deployment (Railway)

### Prerequisites

- Railway account with PostgreSQL plugin
- GitHub repository connected to Railway

### Environment Variables (Railway)

Set these in your Railway project settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Auto | Provided by Railway PostgreSQL plugin |
| `ADMIN_PASSWORD` | Yes | Strong password for admin access |
| `CORS_ORIGINS` | Yes | Your Vercel frontend URL (e.g., `https://entropy-wiki.vercel.app`) |
| `PORT` | No | Railway sets this automatically |

### Deployment Steps

1. Create Railway project and add PostgreSQL plugin
2. Connect your GitHub repository
3. Set the root directory to `api/` in Railway settings
4. Add environment variables (see above)
5. Deploy - Railway will run `npm install && npm run build && npm start`
6. Run migrations: `railway run npm run db:migrate`
7. Optional: Seed data: `railway run npm run db:seed`

### Vercel Integration

Set `NEXT_PUBLIC_API_URL` in Vercel to your Railway API URL:
```
NEXT_PUBLIC_API_URL=https://your-api.railway.app
```

## Local Development

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)

### Setup

1. **Start the database:**

   ```bash
   cd api
   docker compose up -d
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env if needed (defaults work for local dev)
   ```

3. **Install dependencies and run migrations:**

   ```bash
   npm install
   npm run db:migrate
   ```

4. **Seed the database with wiki content (optional):**

   ```bash
   npm run db:seed
   ```

5. **Start the API server:**

   ```bash
   npm run dev
   ```

   The API runs at http://localhost:3001

### Running with Next.js Frontend

1. Start the API (terminal 1):
   ```bash
   cd api && npm run dev
   ```

2. Start the frontend (terminal 2):
   ```bash
   cd .. && npm run dev
   ```

3. The frontend runs at http://localhost:3000 and connects to the API at http://localhost:3001

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to dist/ |
| `npm start` | Run production build |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Import wiki markdown files to database |

### API Endpoints

#### Public Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/pages` | List all published public pages |
| GET | `/pages/:slug` | Get a single published public page |

#### Admin Routes (requires `X-Admin-Password` header)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/pages` | List all pages (including drafts) |
| GET | `/admin/pages/:id` | Get a page by ID |
| POST | `/admin/pages` | Create a new page |
| PATCH | `/admin/pages/:id` | Update a page |
| POST | `/admin/pages/:id/publish` | Publish a page |
| POST | `/admin/pages/:id/unpublish` | Unpublish a page |
| DELETE | `/admin/pages/:id` | Delete a page |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/entropy_wiki` | PostgreSQL connection string |
| `PORT` | `3001` | API server port |
| `ADMIN_PASSWORD` | - | Password for admin routes |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed origins |

## Database Schema

```sql
-- Pages table
CREATE TABLE pages (
  id UUID PRIMARY KEY,
  slug VARCHAR(500) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',        -- draft, published, archived
  visibility VARCHAR(50) DEFAULT 'public',   -- public, private, unlisted
  current_published_revision_id UUID,
  current_draft_revision_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revisions table (content versioning)
CREATE TABLE page_revisions (
  id UUID PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  author_type VARCHAR(50) DEFAULT 'human',   -- human, ai
  author_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Roadmap

### Near-term
- [ ] Rate limiting for public endpoints
- [ ] Request logging/analytics
- [ ] Health check with database status

### Medium-term
- [ ] User authentication (JWT or session-based)
- [ ] Role-based access control (admin, editor, viewer)
- [ ] API versioning

### Long-term
- [ ] Full-text search via PostgreSQL
- [ ] Media upload endpoint (S3/R2 storage)
- [ ] Webhook notifications on publish
- [ ] GraphQL alternative endpoint
