/**
 * API Health Collector
 *
 * Monitors Express API health via existing /health and /health/db endpoints.
 * Tracks API response times, error rates, dependency status, and service availability.
 *
 * Features:
 * - Endpoint health validation
 * - Response time monitoring
 * - Dependency status aggregation
 * - Integration with existing health check infrastructure
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

// API endpoints to monitor
interface HealthEndpoint {
  name: string;
  path: string;
  critical: boolean;  // If critical, failures mark service unhealthy
}

const HEALTH_ENDPOINTS: HealthEndpoint[] = [
  { name: 'api', path: '/health', critical: true },
  { name: 'database', path: '/health/db', critical: true },
];

// Response from /health endpoint
interface BasicHealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

// Response from /health/db endpoint
interface DbHealthResponse {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  result?: { test: number; time: string };
  error?: string;
  code?: string;
  dbUrl?: string;
}

export class ApiHealthCollector implements Collector {
  public readonly name = 'api-health';

  private baseUrl: string;
  private config: CollectorConfig;

  constructor(baseUrl?: string, config?: Partial<CollectorConfig>) {
    // Default to localhost for local development
    this.baseUrl = baseUrl || process.env.API_BASE_URL || 'http://localhost:3001';
    this.config = { ...DEFAULT_COLLECTOR_CONFIG, ...config };
  }

  /**
   * Perform a quick health check - returns overall status
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`, this.config.timeoutMs);
      if (response.ok) {
        return 'healthy';
      }
      return response.status >= 500 ? 'unhealthy' : 'degraded';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Collect comprehensive health data from all endpoints
   */
  async collect(config?: Partial<CollectorConfig>): Promise<CollectorResult> {
    const mergedConfig = { ...this.config, ...config };
    const startTime = Date.now();

    const errors: CollectorError[] = [];
    const metrics: HealthMetrics[] = [];
    const dependencies: DependencyStatus[] = [];

    let criticalErrors = 0;
    let totalResponseTime = 0;
    let successfulChecks = 0;

    // Check each health endpoint
    for (const endpoint of HEALTH_ENDPOINTS) {
      const checkResult = await this.checkEndpoint(endpoint, mergedConfig);

      metrics.push(checkResult.metrics);
      totalResponseTime += checkResult.metrics.responseTimeMs;

      if (checkResult.metrics.success) {
        successfulChecks++;
      }

      if (checkResult.error) {
        errors.push(checkResult.error);
        if (endpoint.critical && checkResult.error.severity === 'critical') {
          criticalErrors++;
        }
      }

      if (checkResult.dependency) {
        dependencies.push(checkResult.dependency);
      }
    }

    const durationMs = Date.now() - startTime;
    const successRate = HEALTH_ENDPOINTS.length > 0
      ? successfulChecks / HEALTH_ENDPOINTS.length
      : 1;

    return {
      collector: this.name,
      status: determineHealthStatus(criticalErrors, errors.length, successRate),
      collectedAt: new Date().toISOString(),
      durationMs,
      errors,
      metrics,
      dependencies,
      summary: {
        totalErrors: errors.length,
        criticalErrors,
        avgResponseTimeMs: HEALTH_ENDPOINTS.length > 0
          ? Math.round(totalResponseTime / HEALTH_ENDPOINTS.length)
          : 0,
        uptime: successRate * 100,
      },
    };
  }

  /**
   * Check a single health endpoint
   */
  private async checkEndpoint(
    endpoint: HealthEndpoint,
    config: CollectorConfig
  ): Promise<{
    metrics: HealthMetrics;
    error?: CollectorError;
    dependency?: DependencyStatus;
  }> {
    const url = `${this.baseUrl}${endpoint.path}`;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < config.retryAttempts) {
      attempts++;

      try {
        const response = await this.fetchWithTimeout(url, config.timeoutMs);
        const responseTimeMs = Date.now() - startTime;
        const data = await response.json();

        const metrics: HealthMetrics = {
          responseTimeMs,
          statusCode: response.status,
          success: response.ok,
          timestamp,
        };

        if (response.ok) {
          // Parse dependency info for database endpoint
          const dependency = this.parseDependencyStatus(endpoint, data, responseTimeMs);

          return { metrics, dependency };
        }

        // Non-OK response - create error
        const error = this.createError(
          endpoint,
          response.status >= 500 ? 'critical' : 'error',
          this.categorizeStatusCode(response.status),
          `${endpoint.name} returned status ${response.status}`,
          { statusCode: response.status, response: data }
        );

        return {
          metrics,
          error,
          dependency: this.parseDependencyStatus(endpoint, data, responseTimeMs),
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Retry on network errors
        if (attempts < config.retryAttempts) {
          await this.delay(config.retryDelayMs * attempts);
          continue;
        }
      }
    }

    // All retries exhausted
    const responseTimeMs = Date.now() - startTime;

    return {
      metrics: {
        responseTimeMs,
        statusCode: 0,
        success: false,
        timestamp,
      },
      error: this.createError(
        endpoint,
        endpoint.critical ? 'critical' : 'error',
        this.categorizeError(lastError),
        lastError?.message || 'Unknown error',
        { attempts, lastError: lastError?.message }
      ),
      dependency: {
        name: endpoint.name,
        status: 'unknown',
        lastChecked: timestamp,
        message: `Failed after ${attempts} attempts: ${lastError?.message}`,
      },
    };
  }

  /**
   * Parse dependency status from health endpoint response
   */
  private parseDependencyStatus(
    endpoint: HealthEndpoint,
    data: unknown,
    latencyMs: number
  ): DependencyStatus {
    const timestamp = new Date().toISOString();

    if (endpoint.path === '/health/db') {
      const dbResponse = data as DbHealthResponse;
      return {
        name: 'database',
        status: dbResponse.database === 'connected' ? 'healthy' : 'unhealthy',
        latencyMs,
        lastChecked: timestamp,
        message: dbResponse.database === 'connected'
          ? 'Database connection active'
          : dbResponse.error || 'Database disconnected',
        details: {
          dbTime: dbResponse.result?.time,
          errorCode: dbResponse.code,
        },
      };
    }

    // Basic health endpoint
    const basicResponse = data as BasicHealthResponse;
    return {
      name: endpoint.name,
      status: basicResponse.status === 'ok' ? 'healthy' : 'degraded',
      latencyMs,
      lastChecked: timestamp,
      message: basicResponse.status === 'ok' ? 'Service operational' : 'Service issue detected',
    };
  }

  /**
   * Create a structured error entry
   */
  private createError(
    endpoint: HealthEndpoint,
    severity: ErrorSeverity,
    category: ErrorCategory,
    message: string,
    details?: Record<string, unknown>
  ): CollectorError {
    return {
      id: generateErrorId(this.name),
      timestamp: new Date().toISOString(),
      severity,
      category,
      message,
      source: `${this.name}:${endpoint.path}`,
      details,
    };
  }

  /**
   * Categorize HTTP status codes to error categories
   */
  private categorizeStatusCode(statusCode: number): ErrorCategory {
    if (statusCode === 401 || statusCode === 403) return 'authentication';
    if (statusCode === 429) return 'rate_limit';
    if (statusCode === 400 || statusCode === 422) return 'validation';
    if (statusCode >= 500) return 'runtime';
    return 'unknown';
  }

  /**
   * Categorize network/fetch errors
   */
  private categorizeError(error: Error | null): ErrorCategory {
    if (!error) return 'unknown';

    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('econnrefused') || message.includes('network')) return 'connection';
    if (message.includes('dns') || message.includes('getaddrinfo')) return 'connection';
    return 'unknown';
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'entropy-wiki-debug-collector',
        },
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance for convenience
export const apiHealthCollector = new ApiHealthCollector();

// Export factory function for custom configuration
export function createApiHealthCollector(
  baseUrl?: string,
  config?: Partial<CollectorConfig>
): ApiHealthCollector {
  return new ApiHealthCollector(baseUrl, config);
}
