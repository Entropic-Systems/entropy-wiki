# Debug Workflow System Documentation

## Overview

The Debug Workflow System is a comprehensive automated error detection, collection, and analysis infrastructure for the entropy-wiki project. It monitors deployment services (Railway, Vercel, GitHub Actions) and API health, collects error data, analyzes patterns, and can automatically create fix-beads for actionable issues.

## Architecture

```
GitHub Actions Trigger
         │
         ▼
┌─────────────────────┐
│  Debug Collection   │
│      Service        │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │  Collectors  │
    └──────────────┘
    │      │      │      │      │
    ▼      ▼      ▼      ▼      ▼
┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐
│API   ││Rail  ││Rail  ││GitHub││Vercel│
│Health││way   ││wayDB ││Action││      │
└──────┘└──────┘└──────┘└──────┘└──────┘
           │
           ▼
┌─────────────────────┐
│   Debug Bundle      │
│   (JSON + Report)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Error Baseline     │
│     Service         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Debug Gate        │
│   (Analysis)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Fix-Bead Creation  │
│  (Circuit Breaker)  │
└─────────────────────┘
```

## Components

### 1. Service Collectors (`api/src/services/collectors/`)

Each collector implements the `Collector` interface and gathers data from a specific service.

#### Types (`types.ts`)
Shared types for all collectors:
- `CollectorError`: Error entry structure
- `CollectorResult`: Standardized result format
- `HealthStatus`: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
- `Collector`: Interface all collectors implement

#### API Health Collector (`api-health.ts`)
Monitors the local Express API health endpoints.

```typescript
import { ApiHealthCollector } from './collectors/index.js';

const collector = new ApiHealthCollector();
const result = await collector.collect({ lookbackMinutes: 30 });
```

**Configuration:**
- `API_BASE_URL`: Base URL for API (default: `http://localhost:3001`)

#### Railway Deployment Collector (`railway.ts`)
Monitors Railway deployment status via GraphQL API.

**Configuration:**
- `RAILWAY_TOKEN`: Railway API authentication token
- `RAILWAY_PROJECT_ID` (optional): Scope to specific project
- `RAILWAY_ENVIRONMENT_ID` (optional): Scope to environment

#### Railway Database Collector (`railway-db.ts`)
Monitors Railway PostgreSQL database health and performance.

**Configuration:**
- Same as Railway Deployment Collector
- Uses Railway's database metrics API

#### GitHub Actions Collector (`github-actions.ts`)
Monitors CI workflow runs, job failures, and test results.

**Configuration:**
- `GITHUB_TOKEN`: GitHub personal access token with `actions:read` scope
- `GITHUB_REPOSITORY`: Repository in `owner/repo` format
- `GITHUB_REPOSITORY_OWNER`: Repository owner

#### Vercel Collector (`vercel.ts`)
Monitors Vercel frontend deployments.

**Configuration:**
- `VERCEL_TOKEN`: Vercel API token
- `VERCEL_PROJECT_ID` (optional): Scope to specific project
- `VERCEL_TEAM_ID` (optional): Team scope for Enterprise

### 2. Debug Collection Service (`api/src/services/debug-collector.ts`)

Central orchestration service that coordinates all collectors and generates debug bundles.

#### Usage

```typescript
import { createDebugCollectionService } from './debug-collector.js';

// Create service with configuration
const service = createDebugCollectionService({
  mode: 'full',        // 'logs' or 'full'
  lookback: '2h',      // '30m', '2h', '1d', '7d'
  collectors: ['all'], // or specific: ['api-health', 'railway']
  parallel: true,      // Run collectors in parallel
});

// Collect debug bundle
const bundle = await service.collect();

// Generate markdown report
const report = service.generateReport(bundle);

// Quick health check
const health = await service.healthCheck();
```

#### Bundle Structure

```typescript
interface DebugBundle {
  id: string;              // Unique bundle ID
  collectedAt: string;     // ISO-8601 timestamp
  durationMs: number;      // Collection duration
  config: CollectionConfig;
  collectors: CollectorSummary[];
  summary: BundleSummary;
  results: CollectorResult[];
  clusters?: ErrorCluster[]; // In 'full' mode only
}
```

### 3. Error Baseline Service (`api/src/services/error-baseline.ts`)

Maintains historical error frequency data for regression detection.

#### Features

- **Pattern Normalization**: Converts error messages to comparable patterns
- **Frequency Classification**: rare/occasional/frequent/constant
- **Regression Detection**: Identifies worsening error patterns
- **Pattern Management**: Acknowledge or suppress known issues

#### Usage

```typescript
import { createErrorBaselineService } from './error-baseline.js';

const baseline = createErrorBaselineService();

// Update with new results
const update = baseline.updateFromResults(bundle.results);
// Returns: { newPatterns, updatedPatterns, regressions }

// Get regressions
const regressions = baseline.getRegressions();

// Get actionable patterns
const actionable = baseline.getActionablePatterns();

// Acknowledge a known issue
baseline.acknowledgePattern('err-abc123', 'Known issue, tracking in JIRA-456');

// Suppress pattern temporarily
baseline.suppressPattern('err-abc123', 7); // 7 days
```

#### Frequency Thresholds

| Classification | Occurrences/Day |
|----------------|-----------------|
| rare           | 0-1             |
| occasional     | 2-5             |
| frequent       | 6-20            |
| constant       | 21+             |

### 4. Debug Gate Service (`api/src/services/debug-gate.ts`)

Analyzes debug bundles and creates fix-beads for actionable issues.

#### Features

- **Error Analysis**: Filters actionable vs noise errors
- **Regression Integration**: Prioritizes regressions
- **Circuit Breaker**: Prevents runaway bead creation
- **Fix-Bead Creation**: Automatically creates beads via `br` command

#### Usage

```typescript
import { createDebugGateService } from './debug-gate.js';

const gate = createDebugGateService({
  createBeads: true,          // Enable auto-bead creation
  minSeverityForBead: 'error', // 'critical', 'error', 'warning'
  circuitBreaker: {
    maxBeadsPerRun: 3,
    maxBeadsPerHour: 5,
    maxBeadsPerDay: 10,
    cooldownMinutes: 30,
  },
});

// Analyze bundle
const analysis = await gate.analyze(bundle);

// Generate report
const report = gate.generateReport(analysis);

// Check circuit breaker status
const cbStatus = gate.getCircuitBreakerStatus();
```

#### Circuit Breaker

The circuit breaker prevents excessive bead creation:

| Limit | Default |
|-------|---------|
| Max per run | 3 |
| Max per hour | 5 |
| Max per day | 10 |
| Cooldown | 30 min |

### 5. Configuration Validator (`api/src/services/config-validator.ts`)

Validates API tokens and service configurations.

```typescript
import { configValidator } from './config-validator.js';

// Full validation with API checks
const result = await configValidator.validateAll(true);

// Quick configuration check (no API calls)
const quick = configValidator.checkConfiguration();

// Get rate limit information
const limits = await configValidator.getRateLimits();

// Generate configuration report
const report = await configValidator.generateReport();
```

## Environment Configuration

Copy `api/.env.debug.example` to `api/.env.debug` and configure:

```bash
# GitHub Actions
GITHUB_TOKEN=ghp_xxxx
GITHUB_REPOSITORY=owner/repo
GITHUB_REPOSITORY_OWNER=owner

# Railway
RAILWAY_TOKEN=your-railway-token

# Vercel
VERCEL_TOKEN=your-vercel-token

# API
API_BASE_URL=http://localhost:3001

# Debug Bundle Settings
DEBUG_BUNDLE_OUTPUT=./debug-bundle
DEBUG_BUNDLE_MODE=logs
DEBUG_BUNDLE_LOOKBACK=2h
```

## CLI Scripts

### Collect Debug Bundle

```bash
cd api
npm run debug:collect
```

### Analyze Debug Bundle

```bash
cd api
npm run debug:analyze
```

## Integration with Bead System

### Workflow Hooks

Two hooks integrate the debug system with the bead workflow:

1. **validate-before-close.sh**: Checks CI status before allowing bead closure
2. **auto-bead-on-commit.sh**: Triggers debug collection on commit failures

### Fix-Bead Creation

When `createBeads: true` is enabled, the Debug Gate Service creates beads:

```
br create --title="Fix: <error message>" --type=bug --priority=<1-4>
```

Priority is determined by:
- Severity (critical=P1, error=P2, warning=P3)
- Category (deployment/database/auth boost priority)
- Regression status (regressions get priority boost)

## Testing

Run the integration tests:

```bash
cd api
npm run test tests/services/debug-workflow.test.ts
```

Tests cover:
- Debug Collection Service
- Error Baseline Service
- Debug Gate Service
- End-to-end workflow

## Troubleshooting

### Common Issues

**"Token is invalid or expired"**
- Regenerate the API token for the affected service
- Ensure token has required scopes (e.g., `actions:read` for GitHub)

**"Rate limit exceeded"**
- Check current limits: `await configValidator.getRateLimits()`
- Reduce collection frequency or lookback window
- Use authenticated tokens (higher limits)

**"Circuit breaker triggered"**
- Wait for cooldown period (default 30 minutes)
- Check `gate.getCircuitBreakerStatus()` for current limits
- Reduce `maxBeadsPerRun` if appropriate

**"Collector timeout"**
- Increase `COLLECTOR_TIMEOUT_MS` (default 30000)
- Check service availability
- Review network connectivity

### Debug Logging

Enable verbose logging:

```typescript
const bundle = await service.collect({
  mode: 'full', // Includes detailed error clustering
});
console.log(JSON.stringify(bundle, null, 2));
```

## API Reference

### DebugCollectionService

| Method | Description |
|--------|-------------|
| `collect(config?)` | Collect debug bundle |
| `healthCheck()` | Quick health check |
| `generateReport(bundle)` | Generate markdown report |
| `getAvailableCollectors()` | List available collectors |
| `lookbackToMinutes(window)` | Convert lookback to minutes |

### ErrorBaselineService

| Method | Description |
|--------|-------------|
| `updateFromResults(results)` | Update baseline with new data |
| `getRegressions()` | Get regression patterns |
| `getActionablePatterns()` | Get patterns needing action |
| `acknowledgePattern(id, notes?)` | Acknowledge pattern |
| `suppressPattern(id, days?)` | Suppress pattern |
| `isSuppressed(id)` | Check if suppressed |
| `export()` | Export baseline data |
| `generateReport()` | Generate baseline report |

### DebugGateService

| Method | Description |
|--------|-------------|
| `analyze(bundle)` | Analyze debug bundle |
| `generateReport(result)` | Generate analysis report |
| `getBaselineService()` | Get baseline service |
| `getCircuitBreakerStatus()` | Get circuit breaker status |

## Best Practices

1. **Start with `mode: 'logs'`** for routine collection; use `mode: 'full'` for detailed analysis
2. **Set appropriate lookback windows** - longer windows provide more context but take longer
3. **Review circuit breaker settings** for your workflow cadence
4. **Acknowledge known issues** to prevent noise in analysis
5. **Use suppressions sparingly** - they should be temporary
6. **Monitor rate limits** especially for GitHub (5000/hour authenticated)
7. **Run collectors in parallel** (`parallel: true`) for faster collection

## Security Considerations

- Store API tokens in environment variables, never in code
- Use minimum required scopes for each token
- Tokens are masked in logs and reports
- The baseline file may contain error patterns - review before sharing
