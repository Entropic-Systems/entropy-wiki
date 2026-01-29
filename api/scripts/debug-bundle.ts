#!/usr/bin/env node
/**
 * Debug Bundle CLI
 *
 * Command-line interface for debug bundle collection and testing.
 * Provides local development and testing capabilities with manual debug collection triggers.
 *
 * Usage:
 *   npx tsx scripts/debug-bundle.ts [options]
 *
 * Options:
 *   --mode <logs|full>         Collection mode (default: logs)
 *   --lookback <30m|2h|1d>     Lookback window (default: 2h)
 *   --collectors <list|all>    Comma-separated collectors or "all" (default: all)
 *   --output <path>            Output directory (default: ./debug-bundle)
 *   --json                     Output as JSON only (no markdown report)
 *
 * Bead: entropy-wiki-1fa
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ApiHealthCollector,
  RailwayCollector,
  RailwayDbCollector,
  GithubActionsCollector,
  VercelCollector,
  CollectorResult,
} from '../src/services/collectors/index.js';

// Parse command-line arguments
interface CliOptions {
  mode: 'logs' | 'full';
  lookback: '30m' | '2h' | '1d';
  collectors: string[];
  output: string;
  json: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'logs',
    lookback: '2h',
    collectors: ['all'],
    output: './debug-bundle',
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--mode':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --mode requires a value (logs or full)');
          process.exit(1);
        }
        if (nextArg === 'logs' || nextArg === 'full') {
          options.mode = nextArg;
        } else {
          console.error(`Error: --mode must be 'logs' or 'full', got '${nextArg}'`);
          process.exit(1);
        }
        i++;
        break;
      case '--lookback':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --lookback requires a value (30m, 2h, or 1d)');
          process.exit(1);
        }
        if (nextArg === '30m' || nextArg === '2h' || nextArg === '1d') {
          options.lookback = nextArg;
        } else {
          console.error(`Error: --lookback must be '30m', '2h', or '1d', got '${nextArg}'`);
          process.exit(1);
        }
        i++;
        break;
      case '--collectors':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --collectors requires a value (comma-separated list or "all")');
          process.exit(1);
        }
        options.collectors = nextArg.split(',').map(c => c.trim());
        i++;
        break;
      case '--output':
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --output requires a path');
          process.exit(1);
        }
        options.output = nextArg;
        i++;
        break;
      case '--json':
        options.json = true;
        break;
    }
  }

  return options;
}

// Convert lookback to minutes
function lookbackToMinutes(lookback: string): number {
  switch (lookback) {
    case '30m':
      return 30;
    case '2h':
      return 120;
    case '1d':
      return 1440;
    default:
      return 120;
  }
}

// All available collectors
const COLLECTOR_MAP: Record<string, () => ApiHealthCollector | RailwayCollector | RailwayDbCollector | GithubActionsCollector | VercelCollector> = {
  'api-health': () => new ApiHealthCollector(),
  'railway': () => new RailwayCollector(),
  'railway-db': () => new RailwayDbCollector(),
  'github-actions': () => new GithubActionsCollector(),
  'vercel': () => new VercelCollector(),
};

// Main collection function
async function collectDebugBundle(options: CliOptions): Promise<void> {
  const startTime = Date.now();
  console.log('Starting debug bundle collection...');
  console.log(`Mode: ${options.mode}`);
  console.log(`Lookback: ${options.lookback}`);
  console.log(`Collectors: ${options.collectors.join(', ')}`);
  console.log(`Output: ${options.output}`);
  console.log('');

  // Create output directory
  if (!existsSync(options.output)) {
    mkdirSync(options.output, { recursive: true });
  }

  // Determine which collectors to run
  const collectorNames = options.collectors.includes('all')
    ? Object.keys(COLLECTOR_MAP)
    : options.collectors.filter(c => c in COLLECTOR_MAP);

  console.log(`Running ${collectorNames.length} collector(s)...`);
  console.log('');

  // Run collectors
  const results: CollectorResult[] = [];
  const lookbackMinutes = lookbackToMinutes(options.lookback);

  for (const name of collectorNames) {
    console.log(`[${name}] Starting collection...`);
    const collector = COLLECTOR_MAP[name]();

    try {
      const result = await collector.collect({ lookbackMinutes });
      results.push(result);
      console.log(`[${name}] Completed: ${result.status} (${result.durationMs}ms)`);
      console.log(`[${name}] Errors: ${result.summary.totalErrors} (${result.summary.criticalErrors} critical)`);

      // Write individual collector output
      writeFileSync(
        join(options.output, `${name}.json`),
        JSON.stringify(result, null, 2)
      );
    } catch (error) {
      console.error(`[${name}] Failed:`, error);
      results.push({
        collector: name,
        status: 'unhealthy',
        collectedAt: new Date().toISOString(),
        durationMs: 0,
        errors: [{
          id: `${name}-collection-error`,
          timestamp: new Date().toISOString(),
          severity: 'critical',
          category: 'unknown',
          message: error instanceof Error ? error.message : String(error),
          source: name,
        }],
        metrics: [],
        dependencies: [],
        summary: {
          totalErrors: 1,
          criticalErrors: 1,
          avgResponseTimeMs: 0,
        },
      });
    }

    console.log('');
  }

  // Aggregate results
  const bundle = {
    collectedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    mode: options.mode,
    lookback: options.lookback,
    collectors: results.map(r => ({
      name: r.collector,
      status: r.status,
      errorCount: r.summary.totalErrors,
      criticalErrors: r.summary.criticalErrors,
    })),
    summary: {
      totalCollectors: results.length,
      healthyCollectors: results.filter(r => r.status === 'healthy').length,
      degradedCollectors: results.filter(r => r.status === 'degraded').length,
      unhealthyCollectors: results.filter(r => r.status === 'unhealthy').length,
      totalErrors: results.reduce((sum, r) => sum + r.summary.totalErrors, 0),
      criticalErrors: results.reduce((sum, r) => sum + r.summary.criticalErrors, 0),
    },
    results,
  };

  // Write bundle
  writeFileSync(
    join(options.output, 'debug-bundle.json'),
    JSON.stringify(bundle, null, 2)
  );
  console.log('Debug bundle written to:', join(options.output, 'debug-bundle.json'));

  // Generate markdown report unless --json flag is set
  if (!options.json) {
    const report = generateMarkdownReport(bundle);
    writeFileSync(join(options.output, 'REPORT.md'), report);
    console.log('Report written to:', join(options.output, 'REPORT.md'));
  }

  // Print summary
  console.log('');
  console.log('=== Collection Summary ===');
  console.log(`Total Duration: ${bundle.durationMs}ms`);
  console.log(`Collectors: ${bundle.summary.totalCollectors} (${bundle.summary.healthyCollectors} healthy, ${bundle.summary.degradedCollectors} degraded, ${bundle.summary.unhealthyCollectors} unhealthy)`);
  console.log(`Total Errors: ${bundle.summary.totalErrors} (${bundle.summary.criticalErrors} critical)`);

  // Exit with error code if critical errors found
  if (bundle.summary.criticalErrors > 0) {
    console.log('');
    console.log('WARNING: Critical errors detected!');
    process.exitCode = 1;
  }
}

// Generate markdown report
function generateMarkdownReport(bundle: {
  collectedAt: string;
  durationMs: number;
  mode: string;
  lookback: string;
  summary: {
    totalCollectors: number;
    healthyCollectors: number;
    degradedCollectors: number;
    unhealthyCollectors: number;
    totalErrors: number;
    criticalErrors: number;
  };
  results: CollectorResult[];
}): string {
  const lines: string[] = [];

  lines.push('# Debug Bundle Report');
  lines.push('');
  lines.push(`**Generated:** ${bundle.collectedAt}`);
  lines.push(`**Duration:** ${bundle.durationMs}ms`);
  lines.push(`**Mode:** ${bundle.mode}`);
  lines.push(`**Lookback:** ${bundle.lookback}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Collectors | ${bundle.summary.totalCollectors} |`);
  lines.push(`| Healthy | ${bundle.summary.healthyCollectors} |`);
  lines.push(`| Degraded | ${bundle.summary.degradedCollectors} |`);
  lines.push(`| Unhealthy | ${bundle.summary.unhealthyCollectors} |`);
  lines.push(`| Total Errors | ${bundle.summary.totalErrors} |`);
  lines.push(`| Critical Errors | ${bundle.summary.criticalErrors} |`);
  lines.push('');

  // Collector status
  lines.push('## Collector Status');
  lines.push('');
  lines.push('| Collector | Status | Errors | Critical | Duration |');
  lines.push('|-----------|--------|--------|----------|----------|');

  for (const result of bundle.results) {
    const statusEmoji = result.status === 'healthy' ? '✅' : result.status === 'degraded' ? '⚠️' : '❌';
    lines.push(`| ${result.collector} | ${statusEmoji} ${result.status} | ${result.summary.totalErrors} | ${result.summary.criticalErrors} | ${result.durationMs}ms |`);
  }
  lines.push('');

  // Dependencies
  const allDeps = bundle.results.flatMap(r => r.dependencies);
  if (allDeps.length > 0) {
    lines.push('## Dependencies');
    lines.push('');
    lines.push('| Service | Status | Latency | Message |');
    lines.push('|---------|--------|---------|---------|');

    for (const dep of allDeps) {
      const statusEmoji = dep.status === 'healthy' ? '✅' : dep.status === 'degraded' ? '⚠️' : '❌';
      lines.push(`| ${dep.name} | ${statusEmoji} ${dep.status} | ${dep.latencyMs || '-'}ms | ${dep.message || '-'} |`);
    }
    lines.push('');
  }

  // Errors
  const allErrors = bundle.results.flatMap(r => r.errors);
  if (allErrors.length > 0) {
    lines.push('## Errors');
    lines.push('');

    // Critical errors first
    const criticalErrors = allErrors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      lines.push('### Critical Errors');
      lines.push('');
      for (const error of criticalErrors) {
        lines.push(`- **[${error.source}]** ${error.message}`);
        if (error.details) {
          lines.push(`  - Details: \`${JSON.stringify(error.details)}\``);
        }
      }
      lines.push('');
    }

    // Other errors
    const otherErrors = allErrors.filter(e => e.severity !== 'critical');
    if (otherErrors.length > 0) {
      lines.push('### Other Errors');
      lines.push('');
      for (const error of otherErrors.slice(0, 20)) {
        lines.push(`- **[${error.severity}]** [${error.source}] ${error.message}`);
      }
      if (otherErrors.length > 20) {
        lines.push(`- ... and ${otherErrors.length - 20} more errors`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// Run CLI
const args = process.argv.slice(2);
const options = parseArgs(args);
collectDebugBundle(options).catch(console.error);
