/**
 * Railway Deployment Collector
 *
 * Monitors Railway deployment status via GraphQL API for:
 * - Deployment history and current status
 * - Build logs and errors
 * - Runtime errors
 * - Resource metrics
 *
 * Bead: entropy-wiki-1c1
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

// Railway GraphQL API endpoint
const RAILWAY_API_URL = 'https://backboard.railway.app/graphql/v2';

// Railway deployment status types
type RailwayDeploymentStatus =
  | 'BUILDING'
  | 'DEPLOYING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CRASHED'
  | 'REMOVED'
  | 'INITIALIZING'
  | 'SLEEPING'
  | 'QUEUED'
  | 'WAITING';

// GraphQL response types
interface RailwayDeployment {
  id: string;
  status: RailwayDeploymentStatus;
  createdAt: string;
  updatedAt: string;
  staticUrl?: string;
  canRedeploy: boolean;
}

interface RailwayService {
  id: string;
  name: string;
  updatedAt: string;
}

interface RailwayProject {
  id: string;
  name: string;
  updatedAt: string;
  services: {
    edges: Array<{ node: RailwayService }>;
  };
}

interface DeploymentLogEntry {
  timestamp: string;
  message: string;
  severity: string;
}

interface RailwayError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: RailwayError[];
}

// GraphQL queries
const DEPLOYMENTS_QUERY = `
  query deployments($projectId: String!, $first: Int) {
    deployments(input: { projectId: $projectId }, first: $first) {
      edges {
        node {
          id
          status
          createdAt
          updatedAt
          staticUrl
          canRedeploy
        }
      }
    }
  }
`;

const PROJECT_QUERY = `
  query project($projectId: String!) {
    project(id: $projectId) {
      id
      name
      updatedAt
      services {
        edges {
          node {
            id
            name
            updatedAt
          }
        }
      }
    }
  }
`;

const DEPLOYMENT_LOGS_QUERY = `
  query deploymentLogs($deploymentId: String!, $limit: Int) {
    deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
      timestamp
      message
      severity
    }
  }
`;

/**
 * Map Railway deployment status to health status
 */
function mapDeploymentStatusToHealth(status: RailwayDeploymentStatus): HealthStatus {
  switch (status) {
    case 'SUCCESS':
      return 'healthy';
    case 'BUILDING':
    case 'DEPLOYING':
    case 'INITIALIZING':
    case 'QUEUED':
    case 'WAITING':
      return 'degraded';
    case 'FAILED':
    case 'CRASHED':
      return 'unhealthy';
    case 'SLEEPING':
    case 'REMOVED':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Map Railway deployment status to error severity
 */
function mapStatusToSeverity(status: RailwayDeploymentStatus): ErrorSeverity {
  switch (status) {
    case 'FAILED':
    case 'CRASHED':
      return 'critical';
    case 'BUILDING':
    case 'DEPLOYING':
      return 'info';
    default:
      return 'warning';
  }
}

/**
 * Categorize Railway errors
 */
function categorizeRailwayError(message: string): ErrorCategory {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'timeout';
  }
  if (lowerMessage.includes('memory') || lowerMessage.includes('oom')) {
    return 'runtime';
  }
  if (lowerMessage.includes('build') || lowerMessage.includes('compile')) {
    return 'deployment';
  }
  if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized')) {
    return 'authentication';
  }
  if (lowerMessage.includes('connect') || lowerMessage.includes('network')) {
    return 'connection';
  }
  if (lowerMessage.includes('database') || lowerMessage.includes('postgres')) {
    return 'database';
  }
  if (lowerMessage.includes('config') || lowerMessage.includes('env')) {
    return 'configuration';
  }

  return 'runtime';
}

export class RailwayCollector implements Collector {
  public readonly name = 'railway-deployment';

  private token: string;
  private projectId: string;
  private config: CollectorConfig;

  constructor(config?: Partial<CollectorConfig>) {
    this.token = process.env.RAILWAY_TOKEN || '';
    this.projectId = process.env.RAILWAY_PROJECT_ID || '';
    this.config = { ...DEFAULT_COLLECTOR_CONFIG, ...config };
  }

  /**
   * Check if collector is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.token && this.projectId);
  }

  /**
   * Quick health check
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.isConfigured()) {
      return 'unknown';
    }

    try {
      const response = await this.executeGraphQL<{
        deployments: { edges: Array<{ node: RailwayDeployment }> };
      }>(DEPLOYMENTS_QUERY, { projectId: this.projectId, first: 1 });

      if (response.errors?.length) {
        return 'unhealthy';
      }

      const deployment = response.data?.deployments.edges[0]?.node;
      if (deployment) {
        return mapDeploymentStatusToHealth(deployment.status);
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Collect comprehensive deployment data
   */
  async collect(config?: Partial<CollectorConfig>): Promise<CollectorResult> {
    const mergedConfig = { ...this.config, ...config };
    const startTime = Date.now();
    const collectedAt = new Date().toISOString();

    const errors: CollectorError[] = [];
    const metrics: HealthMetrics[] = [];
    const dependencies: DependencyStatus[] = [];

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
          message: 'Railway collector not configured: missing RAILWAY_TOKEN or RAILWAY_PROJECT_ID',
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

    // Fetch project info
    const projectStart = Date.now();
    try {
      const projectResponse = await this.executeGraphQL<{ project: RailwayProject }>(
        PROJECT_QUERY,
        { projectId: this.projectId }
      );
      const projectLatency = Date.now() - projectStart;
      totalResponseTime += projectLatency;

      if (projectResponse.errors?.length) {
        for (const err of projectResponse.errors) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'error',
            category: 'connection',
            message: `Railway API error: ${err.message}`,
            source: `${this.name}:project`,
            details: { path: err.path },
          });
        }
      } else if (projectResponse.data?.project) {
        successfulChecks++;
        dependencies.push({
          name: 'railway-project',
          status: 'healthy',
          latencyMs: projectLatency,
          lastChecked: collectedAt,
          message: `Project: ${projectResponse.data.project.name}`,
          details: {
            projectId: projectResponse.data.project.id,
            services: projectResponse.data.project.services.edges.length,
          },
        });
      }

      metrics.push({
        responseTimeMs: projectLatency,
        statusCode: projectResponse.errors ? 400 : 200,
        success: !projectResponse.errors?.length,
        timestamp: collectedAt,
      });
    } catch (err) {
      const projectLatency = Date.now() - projectStart;
      errors.push({
        id: generateErrorId(this.name),
        timestamp: collectedAt,
        severity: 'critical',
        category: 'connection',
        message: `Failed to fetch Railway project: ${err instanceof Error ? err.message : String(err)}`,
        source: `${this.name}:project`,
      });
      criticalErrors++;
      totalResponseTime += projectLatency;

      metrics.push({
        responseTimeMs: projectLatency,
        statusCode: 0,
        success: false,
        timestamp: collectedAt,
      });
    }

    // Fetch recent deployments
    const deploymentsStart = Date.now();
    try {
      const deploymentsResponse = await this.executeGraphQL<{
        deployments: { edges: Array<{ node: RailwayDeployment }> };
      }>(DEPLOYMENTS_QUERY, { projectId: this.projectId, first: 10 });
      const deploymentsLatency = Date.now() - deploymentsStart;
      totalResponseTime += deploymentsLatency;

      if (deploymentsResponse.errors?.length) {
        for (const err of deploymentsResponse.errors) {
          errors.push({
            id: generateErrorId(this.name),
            timestamp: collectedAt,
            severity: 'error',
            category: 'connection',
            message: `Railway deployments API error: ${err.message}`,
            source: `${this.name}:deployments`,
          });
        }
      } else if (deploymentsResponse.data?.deployments) {
        successfulChecks++;
        const deployments = deploymentsResponse.data.deployments.edges.map(e => e.node);

        // Analyze deployment status
        const latestDeployment = deployments[0];
        if (latestDeployment) {
          const deploymentHealth = mapDeploymentStatusToHealth(latestDeployment.status);

          dependencies.push({
            name: 'railway-deployment',
            status: deploymentHealth,
            latencyMs: deploymentsLatency,
            lastChecked: collectedAt,
            message: `Latest deployment: ${latestDeployment.status}`,
            details: {
              deploymentId: latestDeployment.id,
              createdAt: latestDeployment.createdAt,
              staticUrl: latestDeployment.staticUrl,
            },
          });

          // Track failed deployments
          if (['FAILED', 'CRASHED'].includes(latestDeployment.status)) {
            errors.push({
              id: generateErrorId(this.name),
              timestamp: latestDeployment.updatedAt,
              severity: mapStatusToSeverity(latestDeployment.status),
              category: 'deployment',
              message: `Deployment ${latestDeployment.status.toLowerCase()}: ${latestDeployment.id}`,
              source: `${this.name}:deployment`,
              details: {
                deploymentId: latestDeployment.id,
                status: latestDeployment.status,
                canRedeploy: latestDeployment.canRedeploy,
              },
            });

            if (latestDeployment.status === 'FAILED' || latestDeployment.status === 'CRASHED') {
              criticalErrors++;
            }

            // Try to fetch deployment logs for failed deployments
            try {
              const logsResponse = await this.executeGraphQL<{
                deploymentLogs: DeploymentLogEntry[];
              }>(DEPLOYMENT_LOGS_QUERY, {
                deploymentId: latestDeployment.id,
                limit: 50,
              });

              if (logsResponse.data?.deploymentLogs) {
                // Find error logs
                const errorLogs = logsResponse.data.deploymentLogs.filter(
                  log => log.severity === 'error' || log.severity === 'ERROR'
                );

                for (const log of errorLogs.slice(0, 5)) {
                  errors.push({
                    id: generateErrorId(this.name),
                    timestamp: log.timestamp,
                    severity: 'error',
                    category: categorizeRailwayError(log.message),
                    message: log.message,
                    source: `${this.name}:logs`,
                    details: { deploymentId: latestDeployment.id },
                  });
                }
              }
            } catch {
              // Log fetch failed, continue without logs
            }
          }
        }

        // Check for recent failures in deployment history
        const recentFailures = deployments.filter(
          d => ['FAILED', 'CRASHED'].includes(d.status)
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
              deploymentCount: deployments.length,
            },
          });
        }
      }

      metrics.push({
        responseTimeMs: deploymentsLatency,
        statusCode: deploymentsResponse.errors ? 400 : 200,
        success: !deploymentsResponse.errors?.length,
        timestamp: collectedAt,
      });
    } catch (err) {
      const deploymentsLatency = Date.now() - deploymentsStart;
      errors.push({
        id: generateErrorId(this.name),
        timestamp: collectedAt,
        severity: 'critical',
        category: 'connection',
        message: `Failed to fetch Railway deployments: ${err instanceof Error ? err.message : String(err)}`,
        source: `${this.name}:deployments`,
      });
      criticalErrors++;
      totalResponseTime += deploymentsLatency;

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
    };
  }

  /**
   * Execute GraphQL query against Railway API
   */
  private async executeGraphQL<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<GraphQLResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          errors: [{
            message: `HTTP ${response.status}: ${response.statusText}`,
          }],
        };
      }

      return await response.json() as GraphQLResponse<T>;
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        errors: [{
          message: err instanceof Error ? err.message : String(err),
        }],
      };
    }
  }
}

// Export singleton instance
export const railwayCollector = new RailwayCollector();

// Export factory function
export function createRailwayCollector(
  config?: Partial<CollectorConfig>
): RailwayCollector {
  return new RailwayCollector(config);
}
