# Debug Workflow System

Automated error detection, collection, and analysis system for entropy-wiki infrastructure.

## Overview

The Debug Workflow System provides:
- Multi-service log aggregation from Railway, Vercel, GitHub Actions, and API health endpoints
- Intelligent error clustering and categorization
- Automated fix-bead generation for actionable errors
- CI-integrated validation gates
- Error frequency baseline tracking for regression detection

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Orchestrator                      │
│           (.github/workflows/debug-bundle.yml)                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Debug Bundle CLI / Service                        │
│                  (api/scripts/debug-bundle.ts)                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────┬───────────┼───────────┬─────────────┐
        ▼             ▼           ▼           ▼             ▼
   ┌─────────┐   ┌─────────┐ ┌─────────┐ ┌─────────┐   ┌─────────┐
   │   API   │   │ Railway │ │ Railway │ │ Vercel  │   │ GitHub  │
   │ Health  │   │  Deploy │ │Database │ │Frontend │   │ Actions │
   └─────────┘   └─────────┘ └─────────┘ └─────────┘   └─────────┘
        │             │           │           │             │
        └─────────────┴───────────┴───────────┴─────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Error Analysis Engine                            │
│                   (api/scripts/debug-gate.ts)                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Error Baseline System                            │
│                (api/scripts/error-baseline.json)                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### Service Collectors

Located in `api/src/services/collectors/`:

| Collector | File | Purpose |
|-----------|------|---------|
| API Health | `api-health.ts` | Monitors `/health` and `/health/db` endpoints |
| Railway Deployment | `railway.ts` | Queries Railway GraphQL API for deployment status |
| Railway Database | `railway-db.ts` | Checks PostgreSQL health, migrations, slow queries |
| Vercel Frontend | `vercel.ts` | Monitors frontend deployments and build errors |
| GitHub Actions | `github-actions.ts` | Tracks workflow runs and job failures |

### Debug Bundle CLI

**Location**: `api/scripts/debug-bundle.ts`

**Usage**:
```bash
# Collect logs from all services
npx tsx scripts/debug-bundle.ts --mode full

# Quick collection (last 30 minutes)
npx tsx scripts/debug-bundle.ts --mode logs --lookback 30m

# Specific collectors only
npx tsx scripts/debug-bundle.ts --collectors api-health,railway

# Output to specific file
npx tsx scripts/debug-bundle.ts --output ./debug-output.json
```

**Options**:
| Option | Default | Description |
|--------|---------|-------------|
| `--mode` | `logs` | Collection mode: `logs` or `full` |
| `--lookback` | `30m` | Time window: `30m`, `2h`, `1d` |
| `--collectors` | all | Comma-separated list of collectors |
| `--output` | auto | Output file path |

### Error Analysis Engine

**Location**: `api/scripts/debug-gate.ts`

Analyzes debug bundles to:
- Filter actionable errors from noise
- Detect regression patterns using baseline comparison
- Create categorized fix-beads with dependency linking
- Implement circuit breaker (max 3 beads per run)

**Usage**:
```bash
# Analyze a debug bundle
npx tsx scripts/debug-gate.ts --input debug-bundle.json

# Dry run (no bead creation)
npx tsx scripts/debug-gate.ts --input debug-bundle.json --dry-run

# Create beads automatically
npx tsx scripts/debug-gate.ts --input debug-bundle.json --create-beads
```

### Error Baseline System

**Location**: `api/scripts/error-baseline.json`

Tracks error frequency patterns for regression detection:

```json
{
  "thresholds": {
    "rare": { "minCount": 0, "maxCount": 1 },
    "occasional": { "minCount": 2, "maxCount": 5 },
    "frequent": { "minCount": 6, "maxCount": 20 },
    "constant": { "minCount": 21, "maxCount": null }
  },
  "regressionRules": {
    "significantIncrease": { "percentageThreshold": 50, "absoluteThreshold": 3 },
    "newError": { "previousCount": 0, "currentMin": 1 },
    "frequencyEscalation": { "fromCategory": "rare", "toCategory": "frequent" }
  },
  "errorPatterns": {},
  "history": []
}
```

**Update baseline**:
```bash
npx tsx scripts/update-baseline.ts --input debug-bundle.json
```

## GitHub Actions Workflow

**Location**: `.github/workflows/debug-bundle.yml`

**Triggers**:
- Pull request events (opened, synchronize, reopened)
- Workflow failures in the repository
- Manual dispatch with parameters
- Scheduled daily collection (optional)

**Required Secrets**:
- `RAILWAY_TOKEN`: Railway API authentication
- `VERCEL_TOKEN`: Vercel API authentication
- `GITHUB_TOKEN`: Automatic (actions:read scope)

**Manual Trigger**:
```bash
gh workflow run debug-bundle.yml -f mode=full -f lookback=2h
```

## Claude Hooks

### Validation Before Close Hook

**Location**: `.claude/hooks/validate-before-close.sh`

Runs CI gate checks before closing beads:
- GitHub Actions workflow status
- Railway deployment health
- API health endpoint
- Database connectivity

**Configuration**:
```bash
export CI_GATE_ENABLED=true
export CI_GATE_TIMEOUT=5
export API_BASE_URL=http://localhost:3001
export GITHUB_REPO=owner/repo
```

### Auto-Bug Detection Hook

**Location**: `.claude/hooks/auto-bead-on-commit.sh`

Monitors commits for CI failures and triggers:
- Debug bundle collection
- Bug bead creation
- Conventional commit parsing

**Configuration**:
```bash
export AUTO_BUG_ENABLED=true
export DEBUG_BUNDLE_TRIGGER=true
export MAX_AUTO_BEADS=3
export GITHUB_REPO=owner/repo
```

## Error Categories

| Category | Description | Example |
|----------|-------------|---------|
| `connection` | Network/connection issues | ECONNREFUSED, timeout |
| `authentication` | Auth failures | Invalid token, 401 errors |
| `timeout` | Request timeouts | Gateway timeout, ETIMEDOUT |
| `rate_limit` | Rate limiting/throttling | 429 errors |
| `validation` | Data validation errors | Schema validation failed |
| `database` | Database-specific errors | Connection pool exhausted |
| `deployment` | Deployment/build failures | Build failed, deploy error |
| `runtime` | Runtime application errors | Unhandled exception |
| `configuration` | Configuration issues | Missing env var |
| `unknown` | Unclassified errors | - |

## Error Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| `critical` | Service down, data loss risk | Immediate attention required |
| `error` | Feature broken, degraded service | Fix in current sprint |
| `warning` | Potential issue, non-blocking | Monitor, fix when convenient |
| `info` | Informational, no action needed | Log for context |

## Troubleshooting

### Debug collection fails

1. Check API credentials:
   ```bash
   # Verify Railway token
   curl -H "Authorization: Bearer $RAILWAY_TOKEN" \
     https://backboard.railway.app/graphql/v2 \
     -d '{"query":"{ me { id } }"}'

   # Verify Vercel token
   curl -H "Authorization: Bearer $VERCEL_TOKEN" \
     https://api.vercel.com/v9/projects
   ```

2. Check network connectivity:
   ```bash
   curl -I http://localhost:3001/health
   ```

3. Review collector logs:
   ```bash
   npx tsx scripts/debug-bundle.ts --mode full 2>&1 | tee debug.log
   ```

### Baseline regression false positives

1. Check error pattern normalization:
   ```bash
   npx tsx scripts/update-baseline.ts --input debug-bundle.json --dry-run
   ```

2. Adjust thresholds in `error-baseline.json`:
   ```json
   {
     "regressionRules": {
       "significantIncrease": {
         "percentageThreshold": 75,
         "absoluteThreshold": 5
       }
     }
   }
   ```

### Hook not triggering

1. Verify hook is executable:
   ```bash
   chmod +x .claude/hooks/auto-bead-on-commit.sh
   ```

2. Check hook configuration in `.claude/settings.json`

3. Test hook manually:
   ```bash
   echo '{"tool_input":{"command":"git push"}}' | .claude/hooks/auto-bead-on-commit.sh
   ```

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAILWAY_TOKEN` | - | Railway API token |
| `VERCEL_TOKEN` | - | Vercel API token |
| `GITHUB_TOKEN` | - | GitHub API token |
| `API_BASE_URL` | `http://localhost:3001` | API health endpoint base URL |
| `CI_GATE_ENABLED` | `true` | Enable CI gate checks |
| `CI_GATE_TIMEOUT` | `5` | Timeout in seconds |
| `AUTO_BUG_ENABLED` | `true` | Enable auto-bug detection |
| `DEBUG_BUNDLE_TRIGGER` | `true` | Trigger debug collection on CI failure |
| `MAX_AUTO_BEADS` | `3` | Maximum auto-generated beads per run |

### Collector Configuration

Default configuration in `api/src/services/collectors/types.ts`:

```typescript
export const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  enabled: true,
  timeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  lookbackMinutes: 30,
};
```

## Best Practices

1. **Run debug collection early**: Trigger on PR open, not just failures
2. **Monitor baseline trends**: Check `history` array for patterns
3. **Tune thresholds**: Adjust based on your error frequency patterns
4. **Use dry-run first**: Test bead creation before enabling auto-creation
5. **Keep credentials secure**: Use environment variables, not hardcoded values

## API Reference

### CollectorError

```typescript
interface CollectorError {
  id: string;           // Unique error identifier
  timestamp: string;    // ISO-8601 timestamp
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  source: string;       // Which collector/endpoint
  details?: Record<string, unknown>;
  stackTrace?: string;
  relatedErrors?: string[];
}
```

### CollectorResult

```typescript
interface CollectorResult {
  collector: string;
  status: HealthStatus;
  collectedAt: string;
  durationMs: number;
  errors: CollectorError[];
  metrics: HealthMetrics[];
  dependencies: DependencyStatus[];
  summary: {
    totalErrors: number;
    criticalErrors: number;
    avgResponseTimeMs: number;
    uptime?: number;
  };
  raw?: Record<string, unknown>;
}
```

### HealthStatus

```typescript
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
```

## Related Files

- `api/src/services/collectors/` - Service collector implementations
- `api/scripts/debug-bundle.ts` - CLI for debug collection
- `api/scripts/debug-gate.ts` - Error analysis engine
- `api/scripts/error-baseline.json` - Error frequency baseline
- `api/scripts/update-baseline.ts` - Baseline update utility
- `.github/workflows/debug-bundle.yml` - GitHub Actions workflow
- `.claude/hooks/validate-before-close.sh` - Validation hook
- `.claude/hooks/auto-bead-on-commit.sh` - Auto-bug detection hook
- `api/tests/debug-collectors.test.ts` - Integration tests
