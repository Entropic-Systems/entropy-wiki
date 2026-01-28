/**
 * Debug Gate Service - Error Analysis and Fix-Bead Engine
 *
 * Analyzes debug bundles to identify actionable errors and
 * automatically creates fix-beads for critical issues.
 *
 * Features:
 * - Filter actionable vs noise errors
 * - Detect regression patterns using baseline comparison
 * - Create appropriately categorized fix-beads with dependency linking
 * - Circuit breaker to prevent runaway bead creation
 * - Integration with existing bead system
 *
 * Bead: entropy-wiki-3hd
 */

import { execSync } from 'child_process';
import { CollectorResult, CollectorError } from './collectors/types.js';
import {
  ErrorBaselineService,
  ErrorPatternEntry,
  RegressionResult,
  createErrorBaselineService,
} from './error-baseline.js';
import { DebugBundle } from './debug-collector.js';

// Analysis result structure
export interface AnalysisResult {
  analyzedAt: string;
  bundleId: string;
  summary: AnalysisSummary;
  actionableErrors: ActionableError[];
  regressions: RegressionResult[];
  suppressedErrors: SuppressedError[];
  beadsCreated: BeadCreation[];
  circuitBreakerTriggered: boolean;
}

export interface AnalysisSummary {
  totalErrors: number;
  criticalErrors: number;
  actionableErrors: number;
  suppressedErrors: number;
  regressions: number;
  newPatterns: number;
  beadsCreated: number;
  beadsSkipped: number;
}

export interface ActionableError {
  id: string;
  patternId: string;
  collector: string;
  severity: string;
  category: string;
  message: string;
  suggestedAction: string;
  priority: number;
  isRegression: boolean;
  isNewPattern: boolean;
  details?: Record<string, unknown>;
}

export interface SuppressedError {
  id: string;
  patternId: string;
  reason: 'acknowledged' | 'suppressed' | 'below_threshold' | 'duplicate';
  message: string;
}

export interface BeadCreation {
  beadId: string;
  title: string;
  type: 'bug' | 'task';
  priority: number;
  errorIds: string[];
  patternId: string;
  success: boolean;
  error?: string;
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  maxBeadsPerRun: number;
  maxBeadsPerHour: number;
  maxBeadsPerDay: number;
  cooldownMinutes: number;
}

// Debug gate configuration
export interface DebugGateConfig {
  createBeads: boolean;
  circuitBreaker: CircuitBreakerConfig;
  baselinePath?: string;
  minSeverityForBead: 'critical' | 'error' | 'warning';
  categoriesForBeads: string[];
}

const DEFAULT_CONFIG: DebugGateConfig = {
  createBeads: false,
  circuitBreaker: {
    maxBeadsPerRun: 3,
    maxBeadsPerHour: 5,
    maxBeadsPerDay: 10,
    cooldownMinutes: 30,
  },
  minSeverityForBead: 'error',
  categoriesForBeads: ['deployment', 'database', 'authentication', 'configuration'],
};

// Track bead creation for circuit breaker
interface BeadCreationHistory {
  timestamp: string;
  beadId: string;
  patternId: string;
}

/**
 * Debug Gate Service
 */
export class DebugGateService {
  private config: DebugGateConfig;
  private baselineService: ErrorBaselineService;
  private beadHistory: BeadCreationHistory[] = [];

  constructor(config?: Partial<DebugGateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baselineService = createErrorBaselineService(config?.baselinePath);
  }

  /**
   * Analyze a debug bundle and optionally create fix-beads
   */
  async analyze(bundle: DebugBundle): Promise<AnalysisResult> {
    const actionableErrors: ActionableError[] = [];
    const suppressedErrors: SuppressedError[] = [];
    const beadsCreated: BeadCreation[] = [];
    let circuitBreakerTriggered = false;

    // Update baseline with new errors
    const baselineUpdate = this.baselineService.updateFromResults(bundle.results);

    // Get all errors from results
    const allErrors = bundle.results.flatMap(r => r.errors);

    // Get regressions from baseline service
    const regressions = this.baselineService.getRegressions();
    const regressionPatterns = new Set(regressions.map(r =>
      this.baselineService.normalizeToPattern(r.pattern)
    ));

    // Process each error
    for (const result of bundle.results) {
      for (const error of result.errors) {
        const pattern = this.baselineService.normalizeToPattern(error.message);
        const patternId = this.generatePatternId(pattern);

        // Check if suppressed
        if (this.baselineService.isSuppressed(patternId)) {
          suppressedErrors.push({
            id: error.id,
            patternId,
            reason: 'suppressed',
            message: error.message,
          });
          continue;
        }

        // Check if acknowledged
        const patternEntry = this.baselineService.getPattern(patternId);
        if (patternEntry?.acknowledged) {
          suppressedErrors.push({
            id: error.id,
            patternId,
            reason: 'acknowledged',
            message: error.message,
          });
          continue;
        }

        // Check if actionable
        if (this.isActionable(error)) {
          actionableErrors.push({
            id: error.id,
            patternId,
            collector: result.collector,
            severity: error.severity,
            category: error.category,
            message: error.message,
            suggestedAction: this.suggestAction(error),
            priority: this.calculatePriority(error),
            isRegression: regressionPatterns.has(pattern),
            isNewPattern: !patternEntry,
            details: error.details,
          });
        } else {
          suppressedErrors.push({
            id: error.id,
            patternId,
            reason: 'below_threshold',
            message: error.message,
          });
        }
      }
    }

    // Deduplicate actionable errors by pattern
    const uniqueActionable = this.deduplicateByPattern(actionableErrors);
    const duplicateCount = actionableErrors.length - uniqueActionable.length;

    // Add duplicates to suppressed
    if (duplicateCount > 0) {
      suppressedErrors.push({
        id: 'duplicates',
        patternId: 'various',
        reason: 'duplicate',
        message: `${duplicateCount} duplicate errors suppressed`,
      });
    }

    // Sort by priority
    uniqueActionable.sort((a, b) => {
      // Regressions first
      if (a.isRegression && !b.isRegression) return -1;
      if (!a.isRegression && b.isRegression) return 1;
      // Then by priority
      return a.priority - b.priority;
    });

    // Create beads if enabled
    if (this.config.createBeads && uniqueActionable.length > 0) {
      // Check circuit breaker
      if (this.isCircuitBreakerOpen()) {
        circuitBreakerTriggered = true;
        console.log('Circuit breaker triggered - skipping bead creation');
      } else {
        const errorsForBeads = uniqueActionable.slice(0, this.config.circuitBreaker.maxBeadsPerRun);

        for (const error of errorsForBeads) {
          // Check circuit breaker again before each bead
          if (this.isCircuitBreakerOpen()) {
            circuitBreakerTriggered = true;
            break;
          }

          const beadResult = this.createBead(error);
          beadsCreated.push(beadResult);

          if (beadResult.success) {
            this.recordBeadCreation(beadResult.beadId, error.patternId);
          }
        }
      }
    }

    // Build summary
    const criticalErrors = allErrors.filter(e => e.severity === 'critical').length;
    const summary: AnalysisSummary = {
      totalErrors: allErrors.length,
      criticalErrors,
      actionableErrors: uniqueActionable.length,
      suppressedErrors: suppressedErrors.length,
      regressions: regressions.length,
      newPatterns: baselineUpdate.newPatterns,
      beadsCreated: beadsCreated.filter(b => b.success).length,
      beadsSkipped: uniqueActionable.length - beadsCreated.length,
    };

    return {
      analyzedAt: new Date().toISOString(),
      bundleId: bundle.id,
      summary,
      actionableErrors: uniqueActionable,
      regressions,
      suppressedErrors,
      beadsCreated,
      circuitBreakerTriggered,
    };
  }

  /**
   * Generate pattern ID from pattern string
   */
  private generatePatternId(pattern: string): string {
    let hash = 0;
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `err-${Math.abs(hash).toString(36)}`;
  }

  /**
   * Check if an error is actionable
   */
  private isActionable(error: CollectorError): boolean {
    // Check severity
    const severityRank: Record<string, number> = {
      critical: 4,
      error: 3,
      warning: 2,
      info: 1,
    };

    const minRank = severityRank[this.config.minSeverityForBead] || 3;
    const errorRank = severityRank[error.severity] || 0;

    if (errorRank < minRank) {
      return false;
    }

    // Critical errors are always actionable
    if (error.severity === 'critical') {
      return true;
    }

    // Check category
    if (this.config.categoriesForBeads.includes(error.category)) {
      return true;
    }

    return false;
  }

  /**
   * Suggest action for an error
   */
  private suggestAction(error: CollectorError): string {
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

      case 'runtime':
        return 'Review application logs and fix runtime errors';

      case 'validation':
        return 'Check input validation and data integrity';

      default:
        return 'Investigate and address the root cause';
    }
  }

  /**
   * Calculate error priority
   */
  private calculatePriority(error: CollectorError): number {
    let priority = 3;

    // Severity
    if (error.severity === 'critical') priority = 1;
    else if (error.severity === 'error') priority = 2;
    else if (error.severity === 'warning') priority = 3;
    else priority = 4;

    // Category adjustments
    if (error.category === 'deployment') priority = Math.min(priority, 2);
    if (error.category === 'database') priority = Math.min(priority, 2);
    if (error.category === 'authentication') priority = Math.min(priority, 2);

    return priority;
  }

  /**
   * Deduplicate errors by pattern
   */
  private deduplicateByPattern(errors: ActionableError[]): ActionableError[] {
    const seen = new Set<string>();
    const unique: ActionableError[] = [];

    for (const error of errors) {
      if (!seen.has(error.patternId)) {
        seen.add(error.patternId);
        unique.push(error);
      }
    }

    return unique;
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Clean old history
    this.beadHistory = this.beadHistory.filter(h =>
      new Date(h.timestamp) > dayAgo
    );

    // Check hourly limit
    const hourlyCount = this.beadHistory.filter(h =>
      new Date(h.timestamp) > hourAgo
    ).length;

    if (hourlyCount >= this.config.circuitBreaker.maxBeadsPerHour) {
      return true;
    }

    // Check daily limit
    if (this.beadHistory.length >= this.config.circuitBreaker.maxBeadsPerDay) {
      return true;
    }

    // Check cooldown
    if (this.beadHistory.length > 0) {
      const lastBead = new Date(this.beadHistory[this.beadHistory.length - 1].timestamp);
      const cooldownEnd = new Date(lastBead.getTime() + this.config.circuitBreaker.cooldownMinutes * 60 * 1000);

      // Only apply cooldown if we've hit half the hourly limit
      if (hourlyCount >= this.config.circuitBreaker.maxBeadsPerHour / 2 && now < cooldownEnd) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record bead creation for circuit breaker
   */
  private recordBeadCreation(beadId: string, patternId: string): void {
    this.beadHistory.push({
      timestamp: new Date().toISOString(),
      beadId,
      patternId,
    });
  }

  /**
   * Create a fix-bead using br CLI
   */
  private createBead(error: ActionableError): BeadCreation {
    const title = `Fix: ${error.message.substring(0, 80)}${error.message.length > 80 ? '...' : ''}`;
    const description = [
      error.isRegression ? '**⚠️ REGRESSION DETECTED**\n' : '',
      `**Category:** ${error.category}`,
      `**Collector:** ${error.collector}`,
      `**Severity:** ${error.severity}`,
      `**Suggested Action:** ${error.suggestedAction}`,
      '',
      '**Error Details:**',
      '```',
      error.message.substring(0, 500),
      '```',
    ].filter(Boolean).join('\n');

    try {
      // Use br command (beads_rust)
      const escapedTitle = title.replace(/"/g, '\\"').replace(/`/g, '\\`');
      const result = execSync(
        `br create --title="${escapedTitle}" --type=bug --priority=${error.priority}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      // Extract bead ID from output
      const match = result.match(/Created\s+([a-z0-9-]+)/i) || result.match(/([a-z]+-[a-z0-9]+)/i);
      const beadId = match ? match[1] : `unknown-${Date.now()}`;

      return {
        beadId,
        title,
        type: 'bug',
        priority: error.priority,
        errorIds: [error.id],
        patternId: error.patternId,
        success: true,
      };
    } catch (err) {
      return {
        beadId: '',
        title,
        type: 'bug',
        priority: error.priority,
        errorIds: [error.id],
        patternId: error.patternId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get baseline service
   */
  getBaselineService(): ErrorBaselineService {
    return this.baselineService;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    isOpen: boolean;
    beadsLastHour: number;
    beadsLastDay: number;
    limits: CircuitBreakerConfig;
  } {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const beadsLastHour = this.beadHistory.filter(h =>
      new Date(h.timestamp) > hourAgo
    ).length;

    const beadsLastDay = this.beadHistory.filter(h =>
      new Date(h.timestamp) > dayAgo
    ).length;

    return {
      isOpen: this.isCircuitBreakerOpen(),
      beadsLastHour,
      beadsLastDay,
      limits: this.config.circuitBreaker,
    };
  }

  /**
   * Generate analysis report
   */
  generateReport(result: AnalysisResult): string {
    const lines: string[] = [];

    lines.push('# Debug Gate Analysis Report');
    lines.push('');
    lines.push(`**Bundle ID:** ${result.bundleId}`);
    lines.push(`**Analyzed:** ${result.analyzedAt}`);
    if (result.circuitBreakerTriggered) {
      lines.push('**⚠️ Circuit Breaker Triggered** - Bead creation limited');
    }
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| Total Errors | ${result.summary.totalErrors} |`);
    lines.push(`| Critical Errors | ${result.summary.criticalErrors} |`);
    lines.push(`| Actionable Errors | ${result.summary.actionableErrors} |`);
    lines.push(`| Suppressed Errors | ${result.summary.suppressedErrors} |`);
    lines.push(`| Regressions | ${result.summary.regressions} |`);
    lines.push(`| New Patterns | ${result.summary.newPatterns} |`);
    lines.push(`| Beads Created | ${result.summary.beadsCreated} |`);
    lines.push(`| Beads Skipped | ${result.summary.beadsSkipped} |`);
    lines.push('');

    // Beads created
    if (result.beadsCreated.length > 0) {
      lines.push('## Beads Created');
      lines.push('');
      for (const bead of result.beadsCreated) {
        const status = bead.success ? '✅' : '❌';
        lines.push(`- ${status} **${bead.beadId}** (P${bead.priority}): ${bead.title}`);
        if (!bead.success && bead.error) {
          lines.push(`  - Error: ${bead.error}`);
        }
      }
      lines.push('');
    }

    // Regressions
    if (result.regressions.length > 0) {
      lines.push('## Regressions');
      lines.push('');
      for (const regression of result.regressions.slice(0, 10)) {
        const severityEmoji = regression.severity === 'major' ? '🔴' :
          regression.severity === 'moderate' ? '🟠' : '🟡';
        lines.push(`- ${severityEmoji} **+${regression.increasePercent.toFixed(0)}%** ${regression.category}: ${regression.pattern.substring(0, 60)}...`);
      }
      lines.push('');
    }

    // Actionable errors not fixed
    const unfixed = result.actionableErrors.slice(result.beadsCreated.length);
    if (unfixed.length > 0) {
      lines.push('## Unfixed Actionable Errors');
      lines.push('');
      for (const error of unfixed.slice(0, 10)) {
        const regressionTag = error.isRegression ? ' [REGRESSION]' : '';
        lines.push(`- **[P${error.priority}]** ${error.category}${regressionTag}: ${error.message.substring(0, 60)}...`);
        lines.push(`  - Action: ${error.suggestedAction}`);
      }
      if (unfixed.length > 10) {
        lines.push(`- ... and ${unfixed.length - 10} more errors`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export const debugGateService = new DebugGateService();

// Export factory function
export function createDebugGateService(config?: Partial<DebugGateConfig>): DebugGateService {
  return new DebugGateService(config);
}
