#!/usr/bin/env node
/**
 * Error Baseline Update Utility
 *
 * Updates the error baseline after each debug collection run.
 * Supports regression detection and trend analysis.
 *
 * Usage:
 *   npx tsx scripts/update-baseline.ts --input <debug-bundle.json>
 *
 * Options:
 *   --input <path>      Path to debug bundle JSON (required)
 *   --baseline <path>   Path to baseline file (default: scripts/error-baseline.json)
 *   --dry-run           Show changes without writing
 *
 * Bead: entropy-wiki-3ks
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CollectorError } from '../src/services/collectors/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Types
interface Threshold {
  minCount: number;
  maxCount: number | null;
  description: string;
}

interface RegressionRule {
  percentageThreshold?: number;
  absoluteThreshold?: number;
  previousCount?: number;
  currentMin?: number;
  fromCategory?: string;
  toCategory?: string;
  description: string;
}

interface ErrorPatternEntry {
  pattern: string;
  count: number;
  category: 'rare' | 'occasional' | 'frequent' | 'constant';
  collector: string;
  firstSeen: string;
  lastSeen: string;
  trend: 'increasing' | 'stable' | 'decreasing';
}

interface HistoryEntry {
  timestamp: string;
  totalErrors: number;
  criticalErrors: number;
  patterns: number;
}

interface ErrorBaseline {
  version: string;
  updatedAt: string;
  description: string;
  thresholds: {
    rare: Threshold;
    occasional: Threshold;
    frequent: Threshold;
    constant: Threshold;
  };
  regressionRules: {
    significantIncrease: RegressionRule;
    newError: RegressionRule;
    frequencyEscalation: RegressionRule;
  };
  errorPatterns: Record<string, ErrorPatternEntry>;
  history: HistoryEntry[];
}

interface DebugBundle {
  collectedAt: string;
  results: Array<{
    collector: string;
    errors: CollectorError[];
    summary: {
      totalErrors: number;
      criticalErrors: number;
    };
  }>;
}

interface CliOptions {
  input: string;
  baseline: string;
  dryRun: boolean;
}

// Parse command line arguments
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: '',
    baseline: join(__dirname, 'error-baseline.json'),
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--input':
        options.input = nextArg;
        i++;
        break;
      case '--baseline':
        options.baseline = nextArg;
        i++;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }

  return options;
}

// Normalize error message to a pattern (remove dynamic values)
function normalizeErrorMessage(message: string): string {
  return message
    // Replace UUIDs
    .replace(/[a-f0-9-]{36}/gi, '<UUID>')
    // Replace timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TIMESTAMP>')
    // Replace numbers (but preserve error codes)
    .replace(/(?<!\w)\d+(?!\w)/g, '<N>')
    // Replace file paths
    .replace(/\/[\w\-./]+\.(js|ts|json|md)/g, '<PATH>')
    // Replace URLs
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Determine frequency category based on count
function categorize(
  count: number,
  thresholds: ErrorBaseline['thresholds']
): ErrorPatternEntry['category'] {
  if (count >= (thresholds.constant.minCount || 21)) return 'constant';
  if (count >= (thresholds.frequent.minCount || 6)) return 'frequent';
  if (count >= (thresholds.occasional.minCount || 2)) return 'occasional';
  return 'rare';
}

// Determine trend based on previous and current count
function determineTrend(
  previousCount: number,
  currentCount: number
): ErrorPatternEntry['trend'] {
  if (currentCount > previousCount * 1.1) return 'increasing';
  if (currentCount < previousCount * 0.9) return 'decreasing';
  return 'stable';
}

// Check if a change represents a regression
function isRegression(
  previousEntry: ErrorPatternEntry | undefined,
  currentCount: number,
  rules: ErrorBaseline['regressionRules']
): boolean {
  // New error
  if (!previousEntry || previousEntry.count === 0) {
    return currentCount >= (rules.newError.currentMin || 1);
  }

  // Significant increase
  const percentageIncrease = ((currentCount - previousEntry.count) / previousEntry.count) * 100;
  const absoluteIncrease = currentCount - previousEntry.count;

  if (
    percentageIncrease >= (rules.significantIncrease.percentageThreshold || 50) ||
    absoluteIncrease >= (rules.significantIncrease.absoluteThreshold || 3)
  ) {
    return true;
  }

  return false;
}

// Main update function
async function updateBaseline(options: CliOptions): Promise<void> {
  console.log('Error Baseline Update Utility');
  console.log('==============================');
  console.log('');

  // Validate input
  if (!options.input) {
    console.error('Error: --input is required');
    process.exit(1);
  }

  if (!existsSync(options.input)) {
    console.error(`Error: Input file not found: ${options.input}`);
    process.exit(1);
  }

  // Load debug bundle
  console.log(`Loading debug bundle: ${options.input}`);
  const bundle: DebugBundle = JSON.parse(readFileSync(options.input, 'utf-8'));

  // Load or create baseline
  let baseline: ErrorBaseline;
  if (existsSync(options.baseline)) {
    console.log(`Loading baseline: ${options.baseline}`);
    baseline = JSON.parse(readFileSync(options.baseline, 'utf-8'));
  } else {
    console.log('Creating new baseline...');
    baseline = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      description: 'Error frequency baseline for regression detection',
      thresholds: {
        rare: { minCount: 0, maxCount: 1, description: 'Sporadic errors' },
        occasional: { minCount: 2, maxCount: 5, description: 'Occasional errors' },
        frequent: { minCount: 6, maxCount: 20, description: 'Frequent errors' },
        constant: { minCount: 21, maxCount: null, description: 'Persistent errors' },
      },
      regressionRules: {
        significantIncrease: { percentageThreshold: 50, absoluteThreshold: 3, description: '' },
        newError: { previousCount: 0, currentMin: 1, description: '' },
        frequencyEscalation: { fromCategory: 'rare', toCategory: 'frequent', description: '' },
      },
      errorPatterns: {},
      history: [],
    };
  }

  // Collect all errors from bundle
  const allErrors = bundle.results.flatMap(r =>
    r.errors.map(e => ({ ...e, collector: r.collector }))
  );
  console.log(`Found ${allErrors.length} errors in debug bundle`);

  // Group errors by normalized pattern
  const patternCounts: Record<string, { count: number; collectors: Set<string>; errors: CollectorError[] }> = {};

  for (const error of allErrors) {
    const pattern = normalizeErrorMessage(error.message);
    if (!patternCounts[pattern]) {
      patternCounts[pattern] = { count: 0, collectors: new Set(), errors: [] };
    }
    patternCounts[pattern].count++;
    patternCounts[pattern].collectors.add(error.source.split(':')[0]);
    patternCounts[pattern].errors.push(error);
  }

  // Track changes
  const changes = {
    newPatterns: 0,
    updatedPatterns: 0,
    regressions: 0,
    improvements: 0,
  };

  const now = new Date().toISOString();

  // Update patterns
  for (const [pattern, data] of Object.entries(patternCounts)) {
    const previousEntry = baseline.errorPatterns[pattern];
    const category = categorize(data.count, baseline.thresholds);
    const collector = Array.from(data.collectors).join(',');

    if (!previousEntry) {
      // New pattern
      baseline.errorPatterns[pattern] = {
        pattern,
        count: data.count,
        category,
        collector,
        firstSeen: now,
        lastSeen: now,
        trend: 'stable',
      };
      changes.newPatterns++;

      if (isRegression(undefined, data.count, baseline.regressionRules)) {
        changes.regressions++;
        console.log(`[REGRESSION] New error pattern: ${pattern.substring(0, 60)}...`);
      }
    } else {
      // Update existing pattern
      const trend = determineTrend(previousEntry.count, data.count);

      if (isRegression(previousEntry, data.count, baseline.regressionRules)) {
        changes.regressions++;
        console.log(`[REGRESSION] Increased: ${pattern.substring(0, 60)}... (${previousEntry.count} -> ${data.count})`);
      } else if (data.count < previousEntry.count) {
        changes.improvements++;
      }

      baseline.errorPatterns[pattern] = {
        ...previousEntry,
        count: data.count,
        category,
        collector,
        lastSeen: now,
        trend,
      };
      changes.updatedPatterns++;
    }
  }

  // Add history entry
  const totalErrors = Object.values(baseline.errorPatterns).reduce((sum, p) => sum + p.count, 0);
  const criticalErrors = allErrors.filter(e => e.severity === 'critical').length;

  baseline.history.push({
    timestamp: now,
    totalErrors,
    criticalErrors,
    patterns: Object.keys(baseline.errorPatterns).length,
  });

  // Keep only last 30 history entries
  if (baseline.history.length > 30) {
    baseline.history = baseline.history.slice(-30);
  }

  // Update metadata
  baseline.updatedAt = now;

  // Print summary
  console.log('');
  console.log('=== Update Summary ===');
  console.log(`New patterns: ${changes.newPatterns}`);
  console.log(`Updated patterns: ${changes.updatedPatterns}`);
  console.log(`Regressions detected: ${changes.regressions}`);
  console.log(`Improvements: ${changes.improvements}`);
  console.log(`Total patterns: ${Object.keys(baseline.errorPatterns).length}`);

  // Write baseline
  if (options.dryRun) {
    console.log('');
    console.log('[DRY RUN] Would write to:', options.baseline);
  } else {
    writeFileSync(options.baseline, JSON.stringify(baseline, null, 2));
    console.log('');
    console.log(`Baseline updated: ${options.baseline}`);
  }

  // Exit with error if regressions found
  if (changes.regressions > 0) {
    process.exitCode = 1;
  }
}

// Run CLI
const args = process.argv.slice(2);
const options = parseArgs(args);
updateBaseline(options).catch(console.error);
