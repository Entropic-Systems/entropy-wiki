/**
 * Error Baseline Configuration System
 *
 * Maintains historical error frequency data and thresholds for regression detection.
 * Enables identification of error pattern changes and prevents duplicate fix-beads.
 *
 * Features:
 * - Baseline file structure for error pattern tracking
 * - Frequency threshold definitions (rare/occasional/frequent/constant)
 * - Baseline update algorithms after each debug collection
 * - Regression detection for identifying worsening error patterns
 *
 * Bead: entropy-wiki-3ks
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { CollectorError, CollectorResult } from './collectors/types.js';

// Frequency classifications
export type ErrorFrequency = 'rare' | 'occasional' | 'frequent' | 'constant';

// Frequency thresholds (occurrences per day)
export const FREQUENCY_THRESHOLDS: Record<ErrorFrequency, { min: number; max: number }> = {
  rare: { min: 0, max: 1 },
  occasional: { min: 2, max: 5 },
  frequent: { min: 6, max: 20 },
  constant: { min: 21, max: Infinity },
};

// Error pattern entry in baseline
export interface ErrorPatternEntry {
  pattern: string;
  category: string;
  firstSeen: string;
  lastSeen: string;
  totalCount: number;
  dailyCounts: DailyCount[];
  frequency: ErrorFrequency;
  severity: string;
  collectors: string[];
  acknowledged: boolean;
  suppressedUntil?: string;
  notes?: string;
}

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

// Baseline file structure
export interface ErrorBaseline {
  version: string;
  createdAt: string;
  updatedAt: string;
  config: BaselineConfig;
  patterns: Record<string, ErrorPatternEntry>;
  summary: BaselineSummary;
}

export interface BaselineConfig {
  retentionDays: number;
  regressionThreshold: number; // Percentage increase to trigger regression
  suppressionDays: number;
  maxPatterns: number;
}

export interface BaselineSummary {
  totalPatterns: number;
  rareCount: number;
  occasionalCount: number;
  frequentCount: number;
  constantCount: number;
  acknowledgedCount: number;
  suppressedCount: number;
}

// Regression detection result
export interface RegressionResult {
  pattern: string;
  category: string;
  previousFrequency: ErrorFrequency;
  currentFrequency: ErrorFrequency;
  previousDailyAvg: number;
  currentDailyAvg: number;
  increasePercent: number;
  isRegression: boolean;
  severity: 'minor' | 'moderate' | 'major';
}

// Default configuration
const DEFAULT_CONFIG: BaselineConfig = {
  retentionDays: 30,
  regressionThreshold: 50, // 50% increase triggers regression
  suppressionDays: 7,
  maxPatterns: 1000,
};

const BASELINE_VERSION = '1.0.0';

/**
 * Error Baseline Service
 */
export class ErrorBaselineService {
  private baselinePath: string;
  private baseline: ErrorBaseline;

  constructor(baselinePath?: string) {
    this.baselinePath = baselinePath || join(process.cwd(), 'data', 'error-baseline.json');
    this.baseline = this.loadOrCreateBaseline();
  }

  /**
   * Load existing baseline or create new one
   */
  private loadOrCreateBaseline(): ErrorBaseline {
    if (existsSync(this.baselinePath)) {
      try {
        const data = readFileSync(this.baselinePath, 'utf-8');
        const baseline = JSON.parse(data) as ErrorBaseline;
        // Validate version
        if (baseline.version !== BASELINE_VERSION) {
          console.warn(`Baseline version mismatch: ${baseline.version} vs ${BASELINE_VERSION}`);
        }
        return baseline;
      } catch (error) {
        console.error('Failed to load baseline, creating new one:', error);
      }
    }
    return this.createEmptyBaseline();
  }

  /**
   * Create empty baseline
   */
  private createEmptyBaseline(): ErrorBaseline {
    return {
      version: BASELINE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: { ...DEFAULT_CONFIG },
      patterns: {},
      summary: {
        totalPatterns: 0,
        rareCount: 0,
        occasionalCount: 0,
        frequentCount: 0,
        constantCount: 0,
        acknowledgedCount: 0,
        suppressedCount: 0,
      },
    };
  }

  /**
   * Normalize error message to pattern
   */
  normalizeToPattern(message: string): string {
    return message
      .replace(/[a-f0-9-]{36}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TIMESTAMP>')
      .replace(/\d+\.\d+\.\d+\.\d+/g, '<IP>')
      .replace(/:\d{4,5}/g, ':<PORT>')
      .replace(/\d{10,}/g, '<ID>')
      .replace(/\d+/g, '<N>')
      .trim()
      .substring(0, 200); // Limit pattern length
  }

  /**
   * Generate pattern ID from pattern string
   */
  private generatePatternId(pattern: string): string {
    // Simple hash function for pattern ID
    let hash = 0;
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `err-${Math.abs(hash).toString(36)}`;
  }

  /**
   * Calculate frequency classification from daily counts
   */
  private calculateFrequency(dailyCounts: DailyCount[]): ErrorFrequency {
    if (dailyCounts.length === 0) return 'rare';

    const totalCount = dailyCounts.reduce((sum, d) => sum + d.count, 0);
    const avgDaily = totalCount / Math.max(dailyCounts.length, 1);

    if (avgDaily <= FREQUENCY_THRESHOLDS.rare.max) return 'rare';
    if (avgDaily <= FREQUENCY_THRESHOLDS.occasional.max) return 'occasional';
    if (avgDaily <= FREQUENCY_THRESHOLDS.frequent.max) return 'frequent';
    return 'constant';
  }

  /**
   * Get today's date string
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Update baseline with new errors from collector results
   */
  updateFromResults(results: CollectorResult[]): {
    newPatterns: number;
    updatedPatterns: number;
    regressions: RegressionResult[];
  } {
    const today = this.getTodayDate();
    let newPatterns = 0;
    let updatedPatterns = 0;
    const regressions: RegressionResult[] = [];

    // Group errors by pattern
    const errorsByPattern = new Map<string, {
      errors: CollectorError[];
      collectors: Set<string>;
    }>();

    for (const result of results) {
      for (const error of result.errors) {
        const pattern = this.normalizeToPattern(error.message);
        const patternId = this.generatePatternId(pattern);

        if (!errorsByPattern.has(patternId)) {
          errorsByPattern.set(patternId, {
            errors: [],
            collectors: new Set(),
          });
        }

        const entry = errorsByPattern.get(patternId)!;
        entry.errors.push(error);
        entry.collectors.add(result.collector);
      }
    }

    // Update baseline patterns
    for (const [patternId, { errors, collectors }] of errorsByPattern) {
      const firstError = errors[0];
      const pattern = this.normalizeToPattern(firstError.message);

      if (this.baseline.patterns[patternId]) {
        // Update existing pattern
        const existing = this.baseline.patterns[patternId];
        const previousFrequency = existing.frequency;

        existing.lastSeen = new Date().toISOString();
        existing.totalCount += errors.length;

        // Update daily counts
        const todayEntry = existing.dailyCounts.find(d => d.date === today);
        if (todayEntry) {
          todayEntry.count += errors.length;
        } else {
          existing.dailyCounts.push({ date: today, count: errors.length });
        }

        // Add new collectors
        for (const collector of collectors) {
          if (!existing.collectors.includes(collector)) {
            existing.collectors.push(collector);
          }
        }

        // Update severity to highest seen
        if (this.severityRank(firstError.severity) > this.severityRank(existing.severity)) {
          existing.severity = firstError.severity;
        }

        // Recalculate frequency
        existing.frequency = this.calculateFrequency(existing.dailyCounts);

        // Check for regression
        const regression = this.checkRegression(existing, previousFrequency);
        if (regression.isRegression) {
          regressions.push(regression);
        }

        updatedPatterns++;
      } else {
        // New pattern
        this.baseline.patterns[patternId] = {
          pattern,
          category: firstError.category,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          totalCount: errors.length,
          dailyCounts: [{ date: today, count: errors.length }],
          frequency: errors.length > 5 ? 'frequent' : 'rare',
          severity: firstError.severity,
          collectors: Array.from(collectors),
          acknowledged: false,
        };
        newPatterns++;
      }
    }

    // Prune old data and enforce limits
    this.pruneBaseline();

    // Update summary
    this.updateSummary();

    // Save baseline
    this.baseline.updatedAt = new Date().toISOString();
    this.save();

    return { newPatterns, updatedPatterns, regressions };
  }

  /**
   * Check for regression in error pattern
   */
  private checkRegression(entry: ErrorPatternEntry, previousFrequency: ErrorFrequency): RegressionResult {
    const recentDays = entry.dailyCounts.slice(-7);
    const olderDays = entry.dailyCounts.slice(-14, -7);

    const recentAvg = recentDays.length > 0
      ? recentDays.reduce((sum, d) => sum + d.count, 0) / recentDays.length
      : 0;

    const olderAvg = olderDays.length > 0
      ? olderDays.reduce((sum, d) => sum + d.count, 0) / olderDays.length
      : 0;

    const increasePercent = olderAvg > 0
      ? ((recentAvg - olderAvg) / olderAvg) * 100
      : (recentAvg > 0 ? 100 : 0);

    const isRegression = increasePercent >= this.baseline.config.regressionThreshold;

    let severity: 'minor' | 'moderate' | 'major' = 'minor';
    if (increasePercent >= 200) severity = 'major';
    else if (increasePercent >= 100) severity = 'moderate';

    return {
      pattern: entry.pattern,
      category: entry.category,
      previousFrequency,
      currentFrequency: entry.frequency,
      previousDailyAvg: olderAvg,
      currentDailyAvg: recentAvg,
      increasePercent,
      isRegression,
      severity,
    };
  }

  /**
   * Get severity rank for comparison
   */
  private severityRank(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'error': return 3;
      case 'warning': return 2;
      case 'info': return 1;
      default: return 0;
    }
  }

  /**
   * Prune old data from baseline
   */
  private pruneBaseline(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.baseline.config.retentionDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Prune daily counts older than retention period
    for (const [patternId, entry] of Object.entries(this.baseline.patterns)) {
      entry.dailyCounts = entry.dailyCounts.filter(d => d.date >= cutoffStr);

      // Remove patterns with no recent activity
      if (entry.dailyCounts.length === 0) {
        delete this.baseline.patterns[patternId];
      }
    }

    // Enforce max patterns limit
    const patternIds = Object.keys(this.baseline.patterns);
    if (patternIds.length > this.baseline.config.maxPatterns) {
      // Sort by total count (keep most frequent)
      const sorted = patternIds.sort((a, b) =>
        this.baseline.patterns[b].totalCount - this.baseline.patterns[a].totalCount
      );

      // Remove excess patterns
      for (const id of sorted.slice(this.baseline.config.maxPatterns)) {
        delete this.baseline.patterns[id];
      }
    }
  }

  /**
   * Update summary statistics
   */
  private updateSummary(): void {
    const patterns = Object.values(this.baseline.patterns);
    const now = new Date();

    this.baseline.summary = {
      totalPatterns: patterns.length,
      rareCount: patterns.filter(p => p.frequency === 'rare').length,
      occasionalCount: patterns.filter(p => p.frequency === 'occasional').length,
      frequentCount: patterns.filter(p => p.frequency === 'frequent').length,
      constantCount: patterns.filter(p => p.frequency === 'constant').length,
      acknowledgedCount: patterns.filter(p => p.acknowledged).length,
      suppressedCount: patterns.filter(p =>
        p.suppressedUntil && new Date(p.suppressedUntil) > now
      ).length,
    };
  }

  /**
   * Acknowledge an error pattern (won't create fix-beads)
   */
  acknowledgePattern(patternId: string, notes?: string): boolean {
    if (this.baseline.patterns[patternId]) {
      this.baseline.patterns[patternId].acknowledged = true;
      if (notes) {
        this.baseline.patterns[patternId].notes = notes;
      }
      this.updateSummary();
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Suppress an error pattern for a duration
   */
  suppressPattern(patternId: string, days?: number): boolean {
    const pattern = this.baseline.patterns[patternId];
    if (pattern) {
      const suppressDays = days || this.baseline.config.suppressionDays;
      const suppressUntil = new Date();
      suppressUntil.setDate(suppressUntil.getDate() + suppressDays);
      pattern.suppressedUntil = suppressUntil.toISOString();
      this.updateSummary();
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Check if pattern should be suppressed
   */
  isSuppressed(patternId: string): boolean {
    const pattern = this.baseline.patterns[patternId];
    if (!pattern) return false;
    if (!pattern.suppressedUntil) return false;
    return new Date(pattern.suppressedUntil) > new Date();
  }

  /**
   * Get patterns that should trigger fix-beads
   */
  getActionablePatterns(): ErrorPatternEntry[] {
    const now = new Date();
    return Object.values(this.baseline.patterns).filter(p =>
      !p.acknowledged &&
      (!p.suppressedUntil || new Date(p.suppressedUntil) <= now) &&
      (p.frequency === 'frequent' || p.frequency === 'constant' || p.severity === 'critical')
    );
  }

  /**
   * Get regression patterns (error rates worsening)
   */
  getRegressions(): RegressionResult[] {
    const regressions: RegressionResult[] = [];

    for (const entry of Object.values(this.baseline.patterns)) {
      const regression = this.checkRegression(entry, entry.frequency);
      if (regression.isRegression) {
        regressions.push(regression);
      }
    }

    return regressions.sort((a, b) => b.increasePercent - a.increasePercent);
  }

  /**
   * Get baseline summary
   */
  getSummary(): BaselineSummary {
    return { ...this.baseline.summary };
  }

  /**
   * Get all patterns
   */
  getPatterns(): ErrorPatternEntry[] {
    return Object.values(this.baseline.patterns);
  }

  /**
   * Get pattern by ID
   */
  getPattern(patternId: string): ErrorPatternEntry | undefined {
    return this.baseline.patterns[patternId];
  }

  /**
   * Save baseline to file
   */
  save(): void {
    const dir = dirname(this.baselinePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.baselinePath, JSON.stringify(this.baseline, null, 2));
  }

  /**
   * Export baseline for external use
   */
  export(): ErrorBaseline {
    return { ...this.baseline };
  }

  /**
   * Generate baseline report
   */
  generateReport(): string {
    const lines: string[] = [];
    const summary = this.baseline.summary;

    lines.push('# Error Baseline Report');
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Baseline Updated:** ${this.baseline.updatedAt}`);
    lines.push(`**Version:** ${this.baseline.version}`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| Total Patterns | ${summary.totalPatterns} |`);
    lines.push(`| Rare | ${summary.rareCount} |`);
    lines.push(`| Occasional | ${summary.occasionalCount} |`);
    lines.push(`| Frequent | ${summary.frequentCount} |`);
    lines.push(`| Constant | ${summary.constantCount} |`);
    lines.push(`| Acknowledged | ${summary.acknowledgedCount} |`);
    lines.push(`| Suppressed | ${summary.suppressedCount} |`);
    lines.push('');

    // Actionable patterns
    const actionable = this.getActionablePatterns();
    if (actionable.length > 0) {
      lines.push('## Actionable Patterns');
      lines.push('');
      lines.push('| Pattern | Category | Frequency | Total Count |');
      lines.push('|---------|----------|-----------|-------------|');

      for (const pattern of actionable.slice(0, 20)) {
        const shortPattern = pattern.pattern.substring(0, 50) + (pattern.pattern.length > 50 ? '...' : '');
        lines.push(`| ${shortPattern} | ${pattern.category} | ${pattern.frequency} | ${pattern.totalCount} |`);
      }
      lines.push('');
    }

    // Regressions
    const regressions = this.getRegressions();
    if (regressions.length > 0) {
      lines.push('## Regressions Detected');
      lines.push('');
      lines.push('| Pattern | Increase | Severity |');
      lines.push('|---------|----------|----------|');

      for (const regression of regressions.slice(0, 10)) {
        const shortPattern = regression.pattern.substring(0, 50) + (regression.pattern.length > 50 ? '...' : '');
        lines.push(`| ${shortPattern} | +${regression.increasePercent.toFixed(0)}% | ${regression.severity} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export const errorBaselineService = new ErrorBaselineService();

// Export factory function
export function createErrorBaselineService(baselinePath?: string): ErrorBaselineService {
  return new ErrorBaselineService(baselinePath);
}
