# Beads 404 Issue Debug Plan

## Issue Summary
The `/beads` page returns 404 on Vercel production while other pages like `/beads/cli-reference` and `/context` work correctly.

## Root Causes Identified

### 1. Railway Database Connection Error
- **Finding**: The Railway API (`https://entropy-wiki-production.up.railway.app`) returns `{"error":"database_error","message":"Failed to fetch page"}` for all page requests
- **Impact**: During Vercel builds, if the API is checked before filesystem, the page generation fails
- **Status**: Fixed in code (filesystem-first approach) but need fresh deploy

### 2. Vercel Edge Cache Serving Stale 404
- **Finding**: Vercel's CDN is caching a 404 response from an earlier build
- **Evidence**: `x-vercel-cache: HIT` with 404 status, same etag across requests
- **Impact**: Even after fixes are deployed, the old cached 404 persists

### 3. Forced Deployment Failed
- **Finding**: `vercel --prod --force` deployment errored (status: Error)
- **Impact**: The production deployment still has the old broken code

## Files Changed (Already Committed)

1. **`lib/api/server.ts`** - Changed `revalidate: 0` to `revalidate: 60`
2. **`app/[...slug]/page.tsx`** - Changed from API-first to filesystem-first approach
3. **`.vercelignore`** - Added to exclude `.beads/` directory

## What You Can Do

### Option 1: Trigger Fresh Build from Vercel Dashboard
1. Go to https://vercel.com/wills-projects-9cb36d1a/entropy-wiki
2. Navigate to Deployments
3. Click on the latest successful deployment
4. Click "Redeploy" → Check "Clear Build Cache" option
5. Wait for deployment to complete

### Option 2: Force Purge Vercel Edge Cache
1. Go to Vercel Dashboard → Project Settings → Functions
2. Look for "Purge Cache" or similar option
3. Alternatively, try updating ISR revalidation to force refresh:
   - Add `revalidate = 1` temporarily to `app/[...slug]/page.tsx`
   - Deploy
   - Wait 1-2 minutes
   - Change back to `revalidate = 60`
   - Deploy again

### Option 3: Fix Railway Database
The underlying issue is the Railway database connection. Check:
1. Railway dashboard for database status
2. Check if `DATABASE_URL` environment variable is set correctly
3. Run migrations if needed: `railway run npm run db:migrate`
4. Test API directly: `curl https://entropy-wiki-production.up.railway.app/health`

### Option 4: Temporarily Disable API Fallback
Edit `app/[...slug]/page.tsx` to completely skip API calls during build:

```typescript
async function documentExists(slug: string[]): Promise<boolean> {
  // Only check filesystem during static generation
  return docExists(slug);
}

async function getDocument(slug: string[]): Promise<MDXDocument | null> {
  // Only use filesystem during static generation
  return getDocBySlug(slug);
}
```

This removes the API dependency entirely for static pages.

## Verification Steps After Fix

1. Check Vercel deployment status: `vercel list`
2. Test with curl: `curl -sI https://entropy-wiki.vercel.app/beads`
3. Check for 200 status and correct title:
   ```bash
   curl -s https://entropy-wiki.vercel.app/beads | grep -o "<title>[^<]*</title>"
   # Should output: <title>Beads System Manual | Entropy Wiki</title>
   ```

## Local Build Works Correctly
The local build generates `/beads` correctly:
- `.next/server/app/beads.html` exists with 38KB of content
- Title: "Beads System Manual | Entropy Wiki"
- All beads subpages work correctly

The issue is isolated to the Vercel deployment/caching layer.
