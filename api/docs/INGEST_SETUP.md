# Ingest System Setup Guide

This guide walks you through setting up the Entropy Wiki ingest system from scratch. The ingest system uses Claude CLI to intelligently extract, classify, and integrate content into your wiki.

## Prerequisites

- **Node.js 20+** ([download](https://nodejs.org/))
- **Docker** (for local PostgreSQL) ([download](https://www.docker.com/))
- **Claude Pro Max subscription** (required for Claude CLI)

## Step 1: Install Claude CLI

The ingest system calls Claude in headless mode via the CLI.

### macOS (Homebrew)

```bash
brew install anthropic/tap/claude
```

### Other platforms (npm)

```bash
npm install -g @anthropic-ai/claude-code
```

### Verify installation

```bash
claude --version
```

## Step 2: Authenticate Claude CLI

```bash
claude login
```

This opens your browser. Sign in with the account that has your Claude Pro Max subscription.

### Verify authentication

```bash
echo "Say hello in exactly 3 words" | claude --print -
```

You should see a 3-word greeting. If you get an error about authentication, run `claude login` again.

## Step 3: Clone and Setup the Repository

```bash
git clone <your-repo-url>
cd entropy-wiki/api
```

## Step 4: Start the Database

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` with:
- Database: `entropy_wiki`
- User: `postgres`
- Password: `postgres`

Verify it's running:

```bash
docker compose ps
```

## Step 5: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your admin password:

```env
ADMIN_PASSWORD=your-secure-password-here
```

This password protects all admin endpoints including ingest.

## Step 6: Install Dependencies and Run Migrations

```bash
npm install
npm run db:migrate
```

## Step 7: Start the API Server

```bash
npm run dev
```

The API runs at http://localhost:3001

## Step 8: Test the Ingest System

### Basic test (text content)

```bash
curl -X POST http://localhost:3001/admin/ingest \
  -H "X-Admin-Password: your-secure-password-here" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "source_type": "text",
      "content": "# My First Article\n\nThis is a test article about entropy."
    }]
  }'
```

Expected response:

```json
{
  "job": {
    "id": "uuid-here",
    "status": "pending",
    "mode": "manual",
    "total_items": 1,
    ...
  },
  "message": "Created ingest job with 1 item(s)"
}
```

### Check job status

```bash
curl http://localhost:3001/admin/ingest/jobs \
  -H "X-Admin-Password: your-secure-password-here"
```

### Ingest from URL

```bash
curl -X POST http://localhost:3001/admin/ingest \
  -H "X-Admin-Password: your-secure-password-here" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "source_type": "url",
      "url": "https://example.com/article"
    }]
  }'
```

## Troubleshooting

### "claude: command not found"

Claude CLI isn't installed or not in PATH.

```bash
# Check if installed via npm
npm list -g @anthropic-ai/claude-code

# Or reinstall
npm install -g @anthropic-ai/claude-code
```

### "Authentication required" or "Unauthorized"

1. Run `claude login` again
2. Make sure you're logged into an account with Claude Pro Max
3. Check that the browser login completed successfully

### "ADMIN_PASSWORD not set in environment"

Make sure your `.env` file exists and has `ADMIN_PASSWORD` set:

```bash
cat .env | grep ADMIN_PASSWORD
```

### Database connection errors

1. Check Docker is running: `docker compose ps`
2. Check logs: `docker compose logs postgres`
3. Restart if needed: `docker compose restart`

### "Invalid admin password" (401 error)

The `X-Admin-Password` header value doesn't match `.env`:

```bash
# Check what you set
cat .env | grep ADMIN_PASSWORD

# Use that exact value in your curl command
curl -H "X-Admin-Password: <exact-value-from-env>" ...
```

### Job stays in "pending" status

The job processor might not be running or there might be an issue with Claude CLI. Check server logs:

```bash
# If running with npm run dev, logs appear in terminal
# Or check for errors in the Claude call
```

## API Reference

### POST /admin/ingest

Submit content for ingestion.

**Headers:**
- `X-Admin-Password: <password>` (required)
- `Content-Type: application/json`

**Body:**

```json
{
  "items": [
    {
      "source_type": "text",
      "content": "# Title\n\nContent here..."
    }
  ],
  "mode": "manual"
}
```

**Source types:**
- `text` - Raw markdown/text content (requires `content` field)
- `url` - URL to fetch and process (requires `url` field)
- `file` - Local file path (requires `content` with file contents)
- `api` - API response (requires `content` with API data)

### GET /admin/ingest/jobs

List all ingest jobs with pagination.

**Query params:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `status` - Filter by status (pending, processing, completed, failed)

### GET /admin/ingest/jobs/:id

Get details of a specific job including its items.

### POST /admin/ingest/jobs/:id/retry

Retry all failed items in a job.

### DELETE /admin/ingest/jobs/:id

Delete a job and all its items. Use `?force=true` to delete a processing job.

## Next Steps

- Read the main [API README](../README.md) for full API documentation
- Check [wiki-ingest.md](../../wiki/wiki-ingest.md) for the ingest system design
