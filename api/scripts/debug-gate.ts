#!/usr/bin/env node
/**
 * Debug Gate - Error Analysis and Fix-Bead Engine
 *
 * Analyzes debug bundles to identify actionable errors and
 * can automatically create fix-beads for critical issues.
 *
 * Usage:
 *   npx tsx scripts/debug-gate.ts [options]
 *
 * Options:
 *   --input <path>      Path to debug-bundle.json (required)
 *   --output <path>     Output path for analysis results
 *   --create-beads      Create beads for actionable errors (requires bd CLI)
 *   --max-beads <n>     Maximum number of beads to create (default: 3)
 *   --baseline <path>   Path to error baseline for regression detection
 *
 * Bead: entropy-wiki-3hd
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { CollectorResult, CollectorError } from '../src/services/collectors/types.js';

// Analysis result structure
interface AnalysisResult {
  analyzedAt: string;
  inputFile: string;
  summary: {
    totalErrors: number;
    criticalErrors: number;
    actionableErrors: number;
    regressions: number;
    newErrors: number;
  };
  actionableErrors: ActionableError[];
  regressions: RegressionError[];
  beadsCreated: BeadCreation[];
}

interface ActionableError {
  id: string;
  collector: string;
  severity: string;
  category: string;
  message: string;
  suggestedAction: string;
  priority: number;
  details?: Record<string, unknown>;
}

interface RegressionError {
  errorId: string;
  previousCount: number;
  currentCount: number;
  increasePercent: number;
  message: string;
}

interface BeadCreation {
  beadId: string;
  title: string;
  type: string;
  priority: number;
  errorIds: string[];
}

interface ErrorBaseline {
  updatedAt: string;
  errorCounts: Record<string, number>;
}

interface CliOptions {
  input: string;
  output?: string;
  createBeads: boolean;
  maxBeads: number;
  baseline?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: '',
    createBeads: false,
    maxBeads: 3,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--input':
        options.input = nextArg;
        i++;
        break;
      case '--output':
        options.output = nextArg;
        i++;
        break;
      case '--create-beads':
        options.createBeads = true;
        break;
      case '--max-beads':
        options.maxBeads = parseInt(nextArg, 10) || 3;
        i++;
        break;
      case '--baseline':
        options.baseline = nextArg;
        i++;
        break;
    }
  }

  return options;
}

// Determine if an error is actionable
function isActionable(error: CollectorError): boolean {
  // Critical errors are always actionable
  if (error.severity === 'critical') return true;

  // Deployment and database errors are usually actionable
  if (['deployment', 'database', 'authentication'].includes(error.category)) {
    return error.severity === 'error';
  }

  // Connection errors might be transient
  if (error.category === 'connection') {
    // Only actionable if it's not a one-off
    return false;
  }

  return false;
}

// Generate suggested action for an error
function suggestAction(error: CollectorError): string {
  switch (error.category) {
    case 'deployment':
      if (error.message.toLowerCase().includes('build')) {
        return 'Check build logs and fix compilation errors';
      }
      if (error.message.toLowerCase().includes('failed')) {
        return 'Review deployment configuration and retry';
      }
      return 'Review deployment logs and address root cause';

    case 'database':
      if (error.message.toLowerCase().includes('connection')) {
        return 'Check database connectivity and credentials';
      }
      if (error.message.toLowerCase().includes('slow')) {
        return 'Optimize query or add appropriate indexes';
      }
      return 'Review database logs and address the issue';

    case 'authentication':
      return 'Check authentication configuration and refresh tokens if needed';

    case 'timeout':
      return 'Investigate slow endpoint and optimize performance';

    case 'configuration':
      return 'Review configuration files and environment variables';

    default:
      return 'Investigate and address the root cause';
  }
}

// Calculate error priority (lower = higher priority)
function calculatePriority(error: CollectorError): number {
  let priority = 3; // Default P3

  // Severity
  if (error.severity === 'critical') priority = 1;
  else if (error.severity === 'error') priority = 2;
  else if (error.severity === 'warning') priority = 3;
  else priority = 4;

  // Category adjustments
  if (error.category === 'deployment') priority = Math.min(priority, 2);
  if (error.category === 'database') priority = Math.min(priority, 2);

  return priority;
}

// Detect regressions by comparing to baseline
function detectRegressions(
  currentErrors: CollectorError[],
  baseline: ErrorBaseline
): RegressionError[] {
  const regressions: RegressionError[] = [];

  // Group current errors by message pattern
  const currentCounts: Record<string, { count: number; errors: CollectorError[] }> = {};
  for (const error of currentErrors) {
    // Normalize message for comparison (remove specific IDs, timestamps, etc.)
    const pattern = error.message
      .replace(/[a-f0-9-]{36}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
      .replace(/\d+/g, '<N>');

    if (!currentCounts[pattern]) {
      currentCounts[pattern] = { count: 0, errors: [] };
    }
    currentCounts[pattern].count++;
    currentCounts[pattern].errors.push(error);
  }

  // Compare to baseline
  for (const [pattern, { count, errors }] of Object.entries(currentCounts)) {
    const previousCount = baseline.errorCounts[pattern] || 0;

    if (count > previousCount) {
      const increasePercent = previousCount > 0
        ? ((count - previousCount) / previousCount) * 100
        : 100;

      // Only report significant increases
      if (increasePercent >= 50 || count >= previousCount + 3) {
        regressions.push({
          errorId: errors[0].id,
          previousCount,
          currentCount: count,
          increasePercent,
          message: errors[0].message,
        });
      }
    }
  }

  return regressions;
}

// Create a bead using bd CLI
function createBead(
  title: string,
  description: string,
  type: 'bug' | 'task',
  priority: number
): string | null {
  try {
    const result = execSync(
      `bd create --title="${title.replace(/"/g, '\\"')}" --type=${type} --priority=${priority}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Extract bead ID from output
    const match = result.match(/Created\s+([a-z0-9-]+)/i);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Failed to create bead:', error);
    return null;
  }
}

// Main analysis function
async function analyzeDebugBundle(options: CliOptions): Promise<void> {
  console.log('Debug Gate - Error Analysis');
  console.log('===========================');
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
  const bundleData = JSON.parse(readFileSync(options.input, 'utf-8'));
  const results: CollectorResult[] = bundleData.results || [];

  // Load baseline if provided
  let baseline: ErrorBaseline | null = null;
  if (options.baseline && existsSync(options.baseline)) {
    console.log(`Loading baseline: ${options.baseline}`);
    baseline = JSON.parse(readFileSync(options.baseline, 'utf-8'));
  }

  // Collect all errors
  const allErrors = results.flatMap(r => r.errors);
  console.log(`Total errors found: ${allErrors.length}`);

  // Identify actionable errors
  const actionableErrors: ActionableError[] = allErrors
    .filter(isActionable)
    .map(error => ({
      id: error.id,
      collector: error.source.split(':')[0],
      severity: error.severity,
      category: error.category,
      message: error.message,
      suggestedAction: suggestAction(error),
      priority: calculatePriority(error),
      details: error.details,
    }))
    .sort((a, b) => a.priority - b.priority);

  console.log(`Actionable errors: ${actionableErrors.length}`);

  // Detect regressions
  let regressions: RegressionError[] = [];
  if (baseline) {
    regressions = detectRegressions(allErrors, baseline);
    console.log(`Regressions detected: ${regressions.length}`);
  }

  // Create beads if requested
  const beadsCreated: BeadCreation[] = [];
  if (options.createBeads && actionableErrors.length > 0) {
    console.log('');
    console.log('Creating beads for actionable errors...');

    const errorsToFix = actionableErrors.slice(0, options.maxBeads);
    for (const error of errorsToFix) {
      const title = `Fix: ${error.message.substring(0, 80)}${error.message.length > 80 ? '...' : ''}`;
      const description = [
        `**Category:** ${error.category}`,
        `**Collector:** ${error.collector}`,
        `**Suggested Action:** ${error.suggestedAction}`,
        '',
        `**Error Details:**`,
        `\`\`\``,
        error.message,
        `\`\`\``,
      ].join('\n');

      const beadId = createBead(title, description, 'bug', error.priority);
      if (beadId) {
        console.log(`Created bead: ${beadId}`);
        beadsCreated.push({
          beadId,
          title,
          type: 'bug',
          priority: error.priority,
          errorIds: [error.id],
        });
      }
    }
  }

  // Build analysis result
  const criticalErrors = allErrors.filter(e => e.severity === 'critical').length;
  const result: AnalysisResult = {
    analyzedAt: new Date().toISOString(),
    inputFile: options.input,
    summary: {
      totalErrors: allErrors.length,
      criticalErrors,
      actionableErrors: actionableErrors.length,
      regressions: regressions.length,
      newErrors: actionableErrors.filter(e => !regressions.some(r => r.errorId === e.id)).length,
    },
    actionableErrors,
    regressions,
    beadsCreated,
  };

  // Write output
  if (options.output) {
    writeFileSync(options.output, JSON.stringify(result, null, 2));
    console.log('');
    console.log(`Analysis written to: ${options.output}`);
  }

  // Print summary
  console.log('');
  console.log('=== Analysis Summary ===');
  console.log(`Total Errors: ${result.summary.totalErrors}`);
  console.log(`Critical Errors: ${result.summary.criticalErrors}`);
  console.log(`Actionable Errors: ${result.summary.actionableErrors}`);
  console.log(`Regressions: ${result.summary.regressions}`);
  console.log(`Beads Created: ${beadsCreated.length}`);

  // Exit with error code if critical errors found
  if (criticalErrors > 0) {
    process.exitCode = 1;
  }
}

// Run CLI
const args = process.argv.slice(2);
const options = parseArgs(args);
analyzeDebugBundle(options).catch(console.error);
