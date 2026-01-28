/**
 * Debug Collection Service
 *
 * Central orchestration service for debug bundle collection.
 * Coordinates all service collectors, normalizes error data,
 * and generates unified debug bundles.
 *
 * Features:
 * - Parallel collection from all services
 * - Error data normalization and clustering
 * - JSON and Markdown output generation
 * - Auto-prune strategy for artifact management
 * - Express API route integration
 * - GitHub Actions workflow integration
 *
 * Bead: entropy-wiki-all
 */

import {
  ApiHealthCollector,
  RailwayCollector,
  RailwayDbCollector,
  GithubActionsCollector,
  VercelCollector,
  CollectorResult,
  CollectorError,
  HealthStatus,
  Collector,
} from './collectors/index.js';

// Collection modes
export type CollectionMode = 'logs' | 'full';

// Lookback window options
export type LookbackWindow = '30m' | '2h' | '1d' | '7d';

// Collection configuration
export interface CollectionConfig {
  mode: CollectionMode;
  lookback: LookbackWindow;
  collectors: string[];
  parallel: boolean;
}

// Debug bundle structure
export interface DebugBundle {
  id: string;
  collectedAt: string;
  durationMs: number;
  config: CollectionConfig;
  collectors: CollectorSummary[];
  summary: BundleSummary;
  results: CollectorResult[];
  clusters?: ErrorCluster[];
}

export interface CollectorSummary {
  name: string;
  status: HealthStatus;
  errorCount: number;
  criticalErrors: number;
  durationMs: number;
}

export interface BundleSummary {
  totalCollectors: number;
  healthyCollectors: number;
  degradedCollectors: number;
  unhealthyCollectors: number;
  totalErrors: number;
  criticalErrors: number;
  overallHealth: HealthStatus;
}

export interface ErrorCluster {
  id: string;
  pattern: string;
  category: string;
  count: number;
  severity: string;
  collectors: string[];
  samples: CollectorError[];
}

// Default configuration
const DEFAULT_CONFIG: CollectionConfig = {
  mode: 'logs',
  lookback: '2h',
  collectors: ['all'],
  parallel: true,
};

// Available collectors registry
const COLLECTORS: Record<string, () => Collector> = {
  'api-health': () => new ApiHealthCollector(),
  'railway': () => new RailwayCollector(),
  'railway-db': () => new RailwayDbCollector(),
  'github-actions': () => new GithubActionsCollector(),
  'vercel': () => new VercelCollector(),
};

/**
 * Debug Collection Service
 */
export class DebugCollectionService {
  private config: CollectionConfig;

  constructor(config?: Partial<CollectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get available collector names
   */
  static getAvailableCollectors(): string[] {
    return Object.keys(COLLECTORS);
  }

  /**
   * Convert lookback window to minutes
   */
  static lookbackToMinutes(lookback: LookbackWindow): number {
    switch (lookback) {
      case '30m':
        return 30;
      case '2h':
        return 120;
      case '1d':
        return 1440;
      case '7d':
        return 10080;
      default:
        return 120;
    }
  }

  /**
   * Generate unique bundle ID
   */
  private generateBundleId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `debug-${timestamp}-${random}`;
  }

  /**
   * Collect debug bundle with specified configuration
   */
  async collect(config?: Partial<CollectionConfig>): Promise<DebugBundle> {
    const mergedConfig = { ...this.config, ...config };
    const startTime = Date.now();
    const bundleId = this.generateBundleId();

    // Determine which collectors to run
    const collectorNames = mergedConfig.collectors.includes('all')
      ? Object.keys(COLLECTORS)
      : mergedConfig.collectors.filter(name => name in COLLECTORS);

    // Convert lookback to minutes
    const lookbackMinutes = DebugCollectionService.lookbackToMinutes(mergedConfig.lookback);

    // Run collectors
    const results: CollectorResult[] = await this.runCollectors(
      collectorNames,
      lookbackMinutes,
      mergedConfig.parallel
    );

    // Build collector summaries
    const collectors: CollectorSummary[] = results.map(result => ({
      name: result.collector,
      status: result.status,
      errorCount: result.summary.totalErrors,
      criticalErrors: result.summary.criticalErrors,
      durationMs: result.durationMs,
    }));

    // Calculate bundle summary
    const summary = this.calculateSummary(results);

    // Cluster errors if in full mode
    let clusters: ErrorCluster[] | undefined;
    if (mergedConfig.mode === 'full') {
      clusters = this.clusterErrors(results);
    }

    const durationMs = Date.now() - startTime;

    return {
      id: bundleId,
      collectedAt: new Date().toISOString(),
      durationMs,
      config: mergedConfig,
      collectors,
      summary,
      results,
      clusters,
    };
  }

  /**
   * Run collectors (parallel or sequential)
   */
  private async runCollectors(
    names: string[],
    lookbackMinutes: number,
    parallel: boolean
  ): Promise<CollectorResult[]> {
    if (parallel) {
      // Run all collectors in parallel
      const promises = names.map(name => this.runCollector(name, lookbackMinutes));
      return Promise.all(promises);
    } else {
      // Run collectors sequentially
      const results: CollectorResult[] = [];
      for (const name of names) {
        const result = await this.runCollector(name, lookbackMinutes);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * Run a single collector with error handling
   */
  private async runCollector(name: string, lookbackMinutes: number): Promise<CollectorResult> {
    const collectorFactory = COLLECTORS[name];
    if (!collectorFactory) {
      return this.createErrorResult(name, `Unknown collector: ${name}`);
    }

    try {
      const collector = collectorFactory();
      return await collector.collect({ lookbackMinutes });
    } catch (error) {
      return this.createErrorResult(
        name,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Create error result for failed collector
   */
  private createErrorResult(name: string, message: string): CollectorResult {
    return {
      collector: name,
      status: 'unhealthy',
      collectedAt: new Date().toISOString(),
      durationMs: 0,
      errors: [{
        id: `${name}-collection-error`,
        timestamp: new Date().toISOString(),
        severity: 'critical',
        category: 'unknown',
        message,
        source: name,
      }],
      metrics: [],
      dependencies: [],
      summary: {
        totalErrors: 1,
        criticalErrors: 1,
        avgResponseTimeMs: 0,
      },
    };
  }

  /**
   * Calculate bundle summary from collector results
   */
  private calculateSummary(results: CollectorResult[]): BundleSummary {
    const healthyCollectors = results.filter(r => r.status === 'healthy').length;
    const degradedCollectors = results.filter(r => r.status === 'degraded').length;
    const unhealthyCollectors = results.filter(r => r.status === 'unhealthy').length;
    const totalErrors = results.reduce((sum, r) => sum + r.summary.totalErrors, 0);
    const criticalErrors = results.reduce((sum, r) => sum + r.summary.criticalErrors, 0);

    // Determine overall health
    let overallHealth: HealthStatus;
    if (unhealthyCollectors > 0 || criticalErrors > 0) {
      overallHealth = 'unhealthy';
    } else if (degradedCollectors > 0 || totalErrors > 0) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'healthy';
    }

    return {
      totalCollectors: results.length,
      healthyCollectors,
      degradedCollectors,
      unhealthyCollectors,
      totalErrors,
      criticalErrors,
      overallHealth,
    };
  }

  /**
   * Cluster similar errors for analysis
   */
  private clusterErrors(results: CollectorResult[]): ErrorCluster[] {
    const clusters = new Map<string, ErrorCluster>();

    for (const result of results) {
      for (const error of result.errors) {
        // Normalize message to create pattern
        const pattern = this.normalizeErrorPattern(error.message);
        const clusterId = `${error.category}:${pattern.substring(0, 50)}`;

        if (!clusters.has(clusterId)) {
          clusters.set(clusterId, {
            id: clusterId,
            pattern,
            category: error.category,
            count: 0,
            severity: error.severity,
            collectors: [],
            samples: [],
          });
        }

        const cluster = clusters.get(clusterId)!;
        cluster.count++;

        // Add collector if not already present
        const collectorName = result.collector;
        if (!cluster.collectors.includes(collectorName)) {
          cluster.collectors.push(collectorName);
        }

        // Keep up to 3 samples
        if (cluster.samples.length < 3) {
          cluster.samples.push(error);
        }

        // Update severity to highest
        if (this.severityRank(error.severity) > this.severityRank(cluster.severity)) {
          cluster.severity = error.severity;
        }
      }
    }

    // Sort by count descending
    return Array.from(clusters.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Normalize error message to pattern
   */
  private normalizeErrorPattern(message: string): string {
    return message
      .replace(/[a-f0-9-]{36}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TIMESTAMP>')
      .replace(/\d+\.\d+\.\d+\.\d+/g, '<IP>')
      .replace(/:\d{4,5}/g, ':<PORT>')
      .replace(/\d{10,}/g, '<ID>')
      .replace(/\d+/g, '<N>');
  }

  /**
   * Get severity rank for comparison
   */
  private severityRank(severity: string): number {
    switch (severity) {
      case 'critical':
        return 4;
      case 'error':
        return 3;
      case 'warning':
        return 2;
      case 'info':
        return 1;
      default:
        return 0;
    }
  }

  /**
   * Generate Markdown report from bundle
   */
  generateReport(bundle: DebugBundle): string {
    const lines: string[] = [];

    lines.push('# Debug Bundle Report');
    lines.push('');
    lines.push(`**Bundle ID:** ${bundle.id}`);
    lines.push(`**Generated:** ${bundle.collectedAt}`);
    lines.push(`**Duration:** ${bundle.durationMs}ms`);
    lines.push(`**Mode:** ${bundle.config.mode}`);
    lines.push(`**Lookback:** ${bundle.config.lookback}`);
    lines.push('');

    // Overall health
    const healthEmoji = bundle.summary.overallHealth === 'healthy' ? '✅'
      : bundle.summary.overallHealth === 'degraded' ? '⚠️' : '❌';
    lines.push(`## Overall Health: ${healthEmoji} ${bundle.summary.overallHealth.toUpperCase()}`);
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

    for (const collector of bundle.collectors) {
      const statusEmoji = collector.status === 'healthy' ? '✅'
        : collector.status === 'degraded' ? '⚠️' : '❌';
      lines.push(`| ${collector.name} | ${statusEmoji} ${collector.status} | ${collector.errorCount} | ${collector.criticalErrors} | ${collector.durationMs}ms |`);
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
        const statusEmoji = dep.status === 'healthy' ? '✅'
          : dep.status === 'degraded' ? '⚠️' : '❌';
        lines.push(`| ${dep.name} | ${statusEmoji} ${dep.status} | ${dep.latencyMs || '-'}ms | ${dep.message || '-'} |`);
      }
      lines.push('');
    }

    // Error clusters (if available)
    if (bundle.clusters && bundle.clusters.length > 0) {
      lines.push('## Error Patterns');
      lines.push('');

      for (const cluster of bundle.clusters.slice(0, 10)) {
        const severityEmoji = cluster.severity === 'critical' ? '🔴'
          : cluster.severity === 'error' ? '🟠' : '🟡';
        lines.push(`### ${severityEmoji} ${cluster.category} (${cluster.count} occurrences)`);
        lines.push('');
        lines.push(`**Pattern:** \`${cluster.pattern.substring(0, 100)}${cluster.pattern.length > 100 ? '...' : ''}\``);
        lines.push(`**Collectors:** ${cluster.collectors.join(', ')}`);
        lines.push('');
        if (cluster.samples.length > 0) {
          lines.push('**Sample:**');
          lines.push('```');
          lines.push(cluster.samples[0].message.substring(0, 500));
          lines.push('```');
          lines.push('');
        }
      }
    }

    // All errors
    const allErrors = bundle.results.flatMap(r => r.errors);
    if (allErrors.length > 0) {
      lines.push('## All Errors');
      lines.push('');

      // Critical errors first
      const criticalErrors = allErrors.filter(e => e.severity === 'critical');
      if (criticalErrors.length > 0) {
        lines.push('### Critical Errors');
        lines.push('');
        for (const error of criticalErrors) {
          lines.push(`- **[${error.source}]** ${error.message}`);
          if (error.details) {
            lines.push(`  - Details: \`${JSON.stringify(error.details).substring(0, 200)}\``);
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

  /**
   * Quick health check across all collectors
   */
  async healthCheck(): Promise<{
    status: HealthStatus;
    collectors: Record<string, HealthStatus>;
    timestamp: string;
  }> {
    const collectors: Record<string, HealthStatus> = {};

    // Run health checks in parallel
    const checks = Object.entries(COLLECTORS).map(async ([name, factory]) => {
      try {
        const collector = factory();
        const status = await collector.healthCheck();
        return { name, status };
      } catch {
        return { name, status: 'unknown' as HealthStatus };
      }
    });

    const results = await Promise.all(checks);

    for (const { name, status } of results) {
      collectors[name] = status;
    }

    // Determine overall status
    const statuses = Object.values(collectors);
    let status: HealthStatus;
    if (statuses.includes('unhealthy')) {
      status = 'unhealthy';
    } else if (statuses.includes('degraded') || statuses.includes('unknown')) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      collectors,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const debugCollectionService = new DebugCollectionService();

// Export factory function
export function createDebugCollectionService(
  config?: Partial<CollectionConfig>
): DebugCollectionService {
  return new DebugCollectionService(config);
}
