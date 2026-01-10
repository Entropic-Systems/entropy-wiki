# Entropy Wiki API

Express.js API backend for the Entropy Wiki with PostgreSQL storage.

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
