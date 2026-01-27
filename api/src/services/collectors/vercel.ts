/**
 * Vercel Frontend Collector
 *
 * Monitors Vercel deployment status via REST API:
 * - Deployment history and status
 * - Build logs and errors
 * - Static generation errors
 * - Edge function performance
 *
 * Bead: entropy-wiki-bit
 */

import {
  Collector,
  CollectorResult,
  CollectorConfig,
  CollectorError,
  HealthMetrics,
  DependencyStatus,
  HealthStatus,
  ErrorSeverity,
  ErrorCategory,
  DEFAULT_COLLECTOR_CONFIG,
  generateErrorId,
  determineHealthStatus,
} from './types.js';

// Vercel API endpoint
const VERCEL_API_URL = 'https://api.vercel.com';

// Vercel deployment states
type VercelDeploymentState =
  | 'BUILDING'
  | 'ERROR'
  | 'INITIALIZING'
  | 'QUEUED'
  | 'READY'
  | 'CANCELED'
  | 'DELETED';

// Vercel deployment ready state
type VercelReadyState =
  | 'BUILDING'
  | 'ERROR'
  | 'INITIALIZING'
  | 'QUEUED'
  | 'READY'
  | 'CANCELED';

// Vercel-specific configuration
interface VercelConfig extends CollectorConfig {
  projectId?: string;
  teamId?: string;
}

const DEFAULT_VERCEL_CONFIG: VercelConfig = {
  ...DEFAULT_COLLECTOR_CONFIG,
};

// API response types
interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  created: number;
  state: VercelDeploymentState;
  readyState: VercelReadyState;
  type: string;
  creator: { uid: string; username: string };
  inspectorUrl?: string;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubDeployment?: string;
  };
  buildingAt?: number;
  ready?: number;
  target?: string;
  aliasError?: { code: string; message: string };
  aliasAssigned?: number;
}

interface DeploymentsResponse {
  deployments: VercelDeployment[];
  pagination: {
    count: number;
    next?: number;
    prev?: number;
  };
}

interface DeploymentEvent {
  type: string;
  created: number;
  payload: {
    text?: string;
    statusCode?: number;
    deploymentId?: string;
  };
}

interface EventsResponse {
  events: DeploymentEvent[];
}

interface ProjectResponse {
  id: string;
  name: string;
  accountId: string;
  createdAt: number;
  updatedAt: number;
  framework?: string;
  targets?: {
    production?: { id: string; alias?: string[] };
  };
}

/**
 * Map Vercel deployment state to health status
 */
function mapStateToHealth(state: VercelDeploymentState, readyState: VercelReadyState): HealthStatus {
  if (readyState === 'READY' || state === 'READY') return 'healthy';
  if (readyState === 'ERROR' || state === 'ERROR') return 'unhealthy';
  if (['BUILDING', 'INITIALIZING', 'QUEUED'].includes(readyState)) return 'degraded';
  if (state === 'CANCELED' || state === 'DELETED') return 'unknown';
  return 'unknown';
}

/**
 * Map Vercel state to error severity
 */
function mapStateToSeverity(state: VercelDeploymentState): ErrorSeverity {
  if (state === 'ERROR') return 'critical';
  if (state === 'CANCELED') return 'warning';
  return 'info';
}

/**
 * Categorize Vercel errors from messages
 */
function categorizeVercelError(message: string): ErrorCategory {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('build') || lowerMessage.includes('compile') || lowerMessage.includes('webpack')) {
    return 'deployment';
  }
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'timeout';
  }
  if (lowerMessage.includes('memory') || lowerMessage.includes('heap')) {
    return 'runtime';
  }
  if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
    return 'authentication';
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('connect') || lowerMessage.includes('dns')) {
    return 'connection';
  }
  if (lowerMessage.includes('env') || lowerMessage.includes('config') || lowerMessage.includes('variable')) {
    return 'configuration';
  }
  if (lowerMessage.includes('static') || lowerMessage.includes('generation') || lowerMessage.includes('ssg')) {
    return 'deployment';
  }

  return 'runtime';
}

export class VercelCollector implements Collector {
  public readonly name = 'vercel-frontend';

  private token: string;
  private config: VercelConfig;

  constructor(config?: Partial<VercelConfig>) {
    this.token = process.env.VERCEL_TOKEN || '';
    this.config = {
      ...DEFAULT_VERCEL_CONFIG,
      ...config,
      projectId: config?.projectId || process.env.VERCEL_PROJECT_ID,
      teamId: config?.teamId || process.env.VERCEL_TEAM_ID,
    };
  }

  /**
   * Check if collector is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.token);
  }

  /**
   * Quick health check
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.isConfigured()) {
      return 'unknown';
    }

    try {
      // Get latest deployment
      const deployments = await this.fetchDeployments(1);
      if (deployments.deployments.length === 0) {
        return 'unknown';
      }

      const latest = deployments.deployments[0];
      return mapStateToHealth(latest.state, latest.readyState);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Collect comprehensive Vercel deployment data
   */
  async collect(config?: Partial<VercelConfig>): Promise<CollectorResult> {
    const mergedConfig: VercelConfig = { ...this.config, ...config };
    const startTime = Date.now();
    const collectedAt = new Date().toISOString();

    const errors: CollectorError[] = [];
    const metrics: HealthMetrics[] = [];
    const dependencies: DependencyStatus[] = [];
    const rawData: Record<string, unknown> = {};

    // Check if configured
    if (!this.isConfigured()) {
      return {
        collector: this.name,
        status: 'unknown',
        collectedAt,
        durationMs: Date.now() - startTime,
        errors: [{
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'warning',
          category: 'configuration',
          message: 'Vercel collector not configured: missing VERCEL_TOKEN',
          source: this.name,
        }],
        metrics: [],
        dependencies: [],
        summary: {
          totalErrors: 1,
          criticalErrors: 0,
          avgResponseTimeMs: 0,
        },
      };
    }

    let criticalErrors = 0;
    let totalResponseTime = 0;
    let successfulChecks = 0;

    // Fetch project info if projectId is configured
    if (this.config.projectId) {
      const projectStart = Date.now();
      try {
        const project = await this.fetchProject(this.config.projectId);
        const projectLatency = Date.now() - projectStart;
        totalResponseTime += projectLatency;
        successfulChecks++;
        rawData.project = project;

        metrics.push({
          responseTimeMs: projectLatency,
          statusCode: 200,
          success: true,
          timestamp: collectedAt,
        });

        dependencies.push({
          name: 'vercel-project',
          status: 'healthy',
          latencyMs: projectLatency,
          lastChecked: collectedAt,
          message: `Project: ${project.name}`,
          details: {
            framework: project.framework,
            id: project.id,
          },
        });
      } catch (err) {
        const projectLatency = Date.now() - projectStart;
        totalResponseTime += projectLatency;

        errors.push({
          id: generateErrorId(this.name),
          timestamp: collectedAt,
          severity: 'error',
          category: 'connection',
          message: `Failed to fetch Vercel project: ${err instanceof Error ? err.message : String(err)}`,
          source: `${this.name}:project`,
        });

        metrics.push({
          responseTimeMs: projectLatency,
          statusCode: 0,
          success: false,
          timestamp: collectedAt,
        });
      }
    }

    // Fetch recent deployments
    const deploymentsStart = Date.now();
    try {
      const deployments = await this.fetchDeployments(10);
      const deploymentsLatency = Date.now() - deploymentsStart;
      totalResponseTime += deploymentsLatency;
      successfulChecks++;
      rawData.deployments = deployments.deployments;

      metrics.push({
        responseTimeMs: deploymentsLatency,
        statusCode: 200,
        success: true,
        timestamp: collectedAt,
      });

      if (deployments.deployments.length > 0) {
        const latest = deployments.deployments[0];
        const deploymentHealth = mapStateToHealth(latest.state, latest.readyState);

        dependencies.push({
          name: 'vercel-deployment',
          status: deploymentHealth,
          latencyMs: deploymentsLatency,
          lastChecked: collectedAt,
          message: `Latest: ${latest.readyState} (${latest.url})`,
          details: {
            deploymentId: latest.uid,
            state: latest.state,
            readyState: latest.readyState,
            url: latest.url,
            commit: latest.meta?.githubCommitSha?.substring(0, 7),
            branch: latest.meta?.githubCommitRef,
          },
        });

        // Track deployment errors
        if (latest.state === 'ERROR' || latest.readyState === 'ERROR') {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: new Date(latest.created).toISOString(),
            severity: 'critical',
            category: 'deployment',
            message: `Deployment failed: ${latest.uid}`,
            source: `${this.name}:deployment`,
            details: {
              deploymentId: latest.uid,
              url: latest.url,
              aliasError: latest.aliasError,
              inspectorUrl: latest.inspectorUrl,
            },
          });
          criticalErrors++;

          // Try to fetch deployment events for more error details
          try {
            const events = await this.fetchDeploymentEvents(latest.uid);
            rawData.events = events.events;

            // Find error events
            const errorEvents = events.events.filter(
              e => e.type === 'error' || e.type === 'stderr' || e.payload.statusCode === 1
            );

            for (const event of errorEvents.slice(0, 5)) {
              if (event.payload.text) {
                errors.push({
                  id: generateErrorId(this.name),
                  timestamp: new Date(event.created).toISOString(),
                  severity: 'error',
                  category: categorizeVercelError(event.payload.text),
                  message: event.payload.text.substring(0, 500),
                  source: `${this.name}:build`,
                  details: { eventType: event.type },
                });
              }
            }
          } catch {
            // Events fetch failed, continue without detailed logs
          }
        }

        // Check alias errors
        if (latest.aliasError) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: new Date(latest.created).toISOString(),
            severity: 'error',
            category: 'configuration',
            message: `Alias error: ${latest.aliasError.message}`,
            source: `${this.name}:alias`,
            details: { code: latest.aliasError.code },
          });
        }

        // Analyze deployment history for patterns
        const recentFailures = deployments.deployments.filter(
          d => d.state === 'ERROR' || d.readyState === 'ERROR'
        );

        if (recentFailures.length > 2) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'warning',
            category: 'deployment',
            message: `Multiple deployment failures detected: ${recentFailures.length} failures in recent history`,
            source: `${this.name}:deployments`,
            details: {
              failureCount: recentFailures.length,
              totalDeployments: deployments.deployments.length,
            },
          });
        }

        // Calculate average build time for successful deployments
        const successfulDeployments = deployments.deployments.filter(
          d => d.ready && d.buildingAt && d.state === 'READY'
        );

        if (successfulDeployments.length > 0) {
          const avgBuildTime = successfulDeployments.reduce(
            (sum, d) => sum + ((d.ready || 0) - (d.buildingAt || 0)),
            0
          ) / successfulDeployments.length;

          rawData.avgBuildTimeMs = avgBuildTime;

          // Warn if build times are slow
          if (avgBuildTime > 300000) { // > 5 minutes
            errors.push({
              id: generateErrorId(this.name),
              timestamp: collectedAt,
              severity: 'info',
              category: 'deployment',
              message: `Slow build times detected: avg ${(avgBuildTime / 60000).toFixed(1)} minutes`,
              source: `${this.name}:performance`,
              details: { avgBuildTimeMs: avgBuildTime },
            });
          }
        }
      }
    } catch (err) {
      const deploymentsLatency = Date.now() - deploymentsStart;
      totalResponseTime += deploymentsLatency;

      errors.push({
        id: generateErrorId(this.name),
        timestamp: collectedAt,
        severity: 'critical',
        category: 'connection',
        message: `Failed to fetch Vercel deployments: ${err instanceof Error ? err.message : String(err)}`,
        source: `${this.name}:deployments`,
      });
      criticalErrors++;

      metrics.push({
        responseTimeMs: deploymentsLatency,
        statusCode: 0,
        success: false,
        timestamp: collectedAt,
      });
    }

    const durationMs = Date.now() - startTime;
    const totalChecks = metrics.length;
    const successRate = totalChecks > 0 ? successfulChecks / totalChecks : 0;

    return {
      collector: this.name,
      status: determineHealthStatus(criticalErrors, errors.length, successRate),
      collectedAt,
      durationMs,
      errors,
      metrics,
      dependencies,
      summary: {
        totalErrors: errors.length,
        criticalErrors,
        avgResponseTimeMs: totalChecks > 0 ? Math.round(totalResponseTime / totalChecks) : 0,
        uptime: successRate * 100,
      },
      raw: rawData,
    };
  }

  /**
   * Fetch deployments from Vercel API
   */
  private async fetchDeployments(limit: number): Promise<DeploymentsResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      state: 'BUILDING,ERROR,INITIALIZING,QUEUED,READY',
    });

    if (this.config.projectId) {
      params.set('projectId', this.config.projectId);
    }
    if (this.config.teamId) {
      params.set('teamId', this.config.teamId);
    }

    const url = `${VERCEL_API_URL}/v6/deployments?${params}`;
    return await this.fetchWithAuth<DeploymentsResponse>(url);
  }

  /**
   * Fetch project info from Vercel API
   */
  private async fetchProject(projectId: string): Promise<ProjectResponse> {
    const params = new URLSearchParams();
    if (this.config.teamId) {
      params.set('teamId', this.config.teamId);
    }

    const url = `${VERCEL_API_URL}/v9/projects/${projectId}${params.toString() ? `?${params}` : ''}`;
    return await this.fetchWithAuth<ProjectResponse>(url);
  }

  /**
   * Fetch deployment events/logs
   */
  private async fetchDeploymentEvents(deploymentId: string): Promise<EventsResponse> {
    const params = new URLSearchParams();
    if (this.config.teamId) {
      params.set('teamId', this.config.teamId);
    }

    const url = `${VERCEL_API_URL}/v2/deployments/${deploymentId}/events${params.toString() ? `?${params}` : ''}`;
    return await this.fetchWithAuth<EventsResponse>(url);
  }

  /**
   * Fetch with authorization and timeout
   */
  private async fetchWithAuth<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Vercel API error ${response.status}: ${error}`);
      }

      return await response.json() as T;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}

// Export singleton instance
export const vercelCollector = new VercelCollector();

// Export factory function
export function createVercelCollector(config?: Partial<VercelConfig>): VercelCollector {
  return new VercelCollector(config);
}
