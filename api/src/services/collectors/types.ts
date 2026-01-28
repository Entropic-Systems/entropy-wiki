/**
 * Shared types for debug bundle service collectors
 *
 * All collectors implement a common interface to provide:
 * - Consistent error data structure
 * - Standardized health status reporting
 * - Unified response timing metrics
 */

// Severity levels for collected errors
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

// Categories for error classification
export type ErrorCategory =
  | 'connection'      // Network/connection issues
  | 'authentication'  // Auth failures
  | 'timeout'         // Request timeouts
  | 'rate_limit'      // Rate limiting/throttling
  | 'validation'      // Data validation errors
  | 'database'        // Database-specific errors
  | 'deployment'      // Deployment/build failures
  | 'runtime'         // Runtime application errors
  | 'configuration'   // Configuration issues
  | 'unknown';        // Unclassified errors

// Health status for services
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

// Individual error entry from a collector
export interface CollectorError {
  id: string;                    // Unique error identifier
  timestamp: string;             // ISO-8601 timestamp
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  source: string;                // Which collector/endpoint
  details?: Record<string, unknown>;
  stackTrace?: string;
  relatedErrors?: string[];      // IDs of related errors
}

// Performance metrics for a health check
export interface HealthMetrics {
  responseTimeMs: number;
  statusCode: number;
  success: boolean;
  timestamp: string;
}

// Dependency status (e.g., database, external services)
export interface DependencyStatus {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  lastChecked: string;
  message?: string;
  details?: Record<string, unknown>;
}

// Result from a single collector
export interface CollectorResult {
  collector: string;             // Collector identifier
  status: HealthStatus;
  collectedAt: string;           // ISO-8601 timestamp
  durationMs: number;            // How long collection took
  errors: CollectorError[];
  metrics: HealthMetrics[];
  dependencies: DependencyStatus[];
  summary: {
    totalErrors: number;
    criticalErrors: number;
    avgResponseTimeMs: number;
    uptime?: number;             // Percentage if available
  };
  raw?: Record<string, unknown>; // Raw response data for debugging
}

// Configuration for collectors
export interface CollectorConfig {
  enabled: boolean;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  endpoints?: string[];
  lookbackMinutes?: number;
}

// Common collector interface
export interface Collector {
  name: string;
  collect(config?: Partial<CollectorConfig>): Promise<CollectorResult>;
  healthCheck(): Promise<HealthStatus>;
}

// Default collector configuration
export const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  enabled: true,
  timeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  lookbackMinutes: 30,
};

// Utility function to generate error IDs
export function generateErrorId(collector: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${collector}-${timestamp}-${random}`;
}

// Utility to determine health status from error counts
export function determineHealthStatus(
  criticalErrors: number,
  totalErrors: number,
  successRate: number
): HealthStatus {
  if (criticalErrors > 0) return 'unhealthy';
  if (successRate < 0.5) return 'unhealthy';
  if (totalErrors > 0 || successRate < 0.95) return 'degraded';
  return 'healthy';
}

/**
 * Sanitize error messages to prevent credential leakage.
 * Removes/redacts:
 * - Bearer tokens (Authorization headers)
 * - Database connection strings with passwords
 * - API keys and tokens in various formats
 * - Password query parameters
 */
export function sanitizeError(message: string): string {
  if (!message) return message;

  return message
    // Redact Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    // Redact PostgreSQL connection strings
    .replace(/postgres(ql)?:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@')
    // Redact password in connection strings
    .replace(/password=[^&\s"']+/gi, 'password=[REDACTED]')
    // Redact API keys (common patterns)
    .replace(/['"](sk|pk|api|key|token|secret)[_-]?[A-Za-z0-9]{20,}['"]/gi, '"[REDACTED_KEY]"')
    // Redact Authorization headers
    .replace(/Authorization:\s*[^\s,}]+/gi, 'Authorization: [REDACTED]')
    // Redact Basic auth
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    // Redact Railway tokens
    .replace(/railway_[A-Za-z0-9_-]+/gi, '[REDACTED_RAILWAY_TOKEN]')
    // Redact Vercel tokens
    .replace(/vercel_[A-Za-z0-9_-]+/gi, '[REDACTED_VERCEL_TOKEN]');
}

/**
 * Generate a pattern ID from a normalized error pattern string.
 * Uses a simple hash function to create a stable, compact identifier.
 */
export function generatePatternId(pattern: string): string {
  let hash = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `err-${Math.abs(hash).toString(36)}`;
}
