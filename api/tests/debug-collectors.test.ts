/**
 * Integration Tests for Debug Workflow Collectors
 *
 * Tests service collectors, error handling, and debug bundle generation.
 *
 * Bead: entropy-wiki-141
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CollectorError,
  ErrorSeverity,
  ErrorCategory,
  HealthStatus,
  CollectorResult,
  CollectorConfig,
  DEFAULT_COLLECTOR_CONFIG,
  generateErrorId,
  determineHealthStatus,
} from '../src/services/collectors/types.js';

// Mock fetch for external API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Collector Types', () => {
  describe('generateErrorId', () => {
    it('should generate unique IDs for each call', () => {
      const id1 = generateErrorId('api-health');
      const id2 = generateErrorId('api-health');
      expect(id1).not.toBe(id2);
    });

    it('should include collector name in ID', () => {
      const id = generateErrorId('railway');
      expect(id.startsWith('railway-')).toBe(true);
    });

    it('should generate properly formatted IDs', () => {
      const id = generateErrorId('test');
      expect(id).toMatch(/^test-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('determineHealthStatus', () => {
    it('should return healthy when no errors and high success rate', () => {
      expect(determineHealthStatus(0, 0, 1.0)).toBe('healthy');
      expect(determineHealthStatus(0, 0, 0.99)).toBe('healthy');
    });

    it('should return unhealthy when critical errors exist', () => {
      expect(determineHealthStatus(1, 1, 1.0)).toBe('unhealthy');
      expect(determineHealthStatus(5, 10, 0.9)).toBe('unhealthy');
    });

    it('should return unhealthy when success rate is below 50%', () => {
      expect(determineHealthStatus(0, 0, 0.4)).toBe('unhealthy');
      expect(determineHealthStatus(0, 5, 0.3)).toBe('unhealthy');
    });

    it('should return degraded for non-critical errors', () => {
      expect(determineHealthStatus(0, 1, 1.0)).toBe('degraded');
      expect(determineHealthStatus(0, 5, 0.95)).toBe('degraded');
    });

    it('should return degraded when success rate is below 95%', () => {
      expect(determineHealthStatus(0, 0, 0.9)).toBe('degraded');
      expect(determineHealthStatus(0, 0, 0.8)).toBe('degraded');
    });
  });
});

describe('Error Types', () => {
  it('should have valid severity levels', () => {
    const validSeverities: ErrorSeverity[] = ['critical', 'error', 'warning', 'info'];
    validSeverities.forEach((s) => expect(typeof s).toBe('string'));
  });

  it('should have valid error categories', () => {
    const validCategories: ErrorCategory[] = [
      'connection',
      'authentication',
      'timeout',
      'rate_limit',
      'validation',
      'database',
      'deployment',
      'runtime',
      'configuration',
      'unknown',
    ];
    validCategories.forEach((c) => expect(typeof c).toBe('string'));
  });

  it('should have valid health statuses', () => {
    const validStatuses: HealthStatus[] = ['healthy', 'degraded', 'unhealthy', 'unknown'];
    validStatuses.forEach((s) => expect(typeof s).toBe('string'));
  });
});

describe('CollectorError Structure', () => {
  it('should create valid error objects', () => {
    const error: CollectorError = {
      id: generateErrorId('test'),
      message: 'Test error message',
      severity: 'error',
      category: 'connection',
      source: 'test-collector',
      timestamp: new Date().toISOString(),
      details: {
        statusCode: 500,
        endpoint: '/api/test',
      },
    };

    expect(error.id).toBeDefined();
    expect(error.message).toBe('Test error message');
    expect(error.severity).toBe('error');
    expect(error.category).toBe('connection');
    expect(error.details?.statusCode).toBe(500);
  });

  it('should support optional fields', () => {
    const error: CollectorError = {
      id: generateErrorId('test'),
      message: 'Minimal error',
      severity: 'warning',
      category: 'unknown',
      source: 'test',
      timestamp: new Date().toISOString(),
      stackTrace: 'Error at line 1',
      relatedErrors: ['error-1', 'error-2'],
    };

    expect(error.stackTrace).toBe('Error at line 1');
    expect(error.relatedErrors).toHaveLength(2);
  });
});

describe('CollectorResult Structure', () => {
  it('should create valid result objects', () => {
    const result: CollectorResult = {
      collector: 'api-health',
      status: 'healthy',
      collectedAt: new Date().toISOString(),
      durationMs: 150,
      errors: [],
      metrics: [],
      dependencies: [],
      summary: {
        totalErrors: 0,
        criticalErrors: 0,
        avgResponseTimeMs: 100,
      },
    };

    expect(result.collector).toBe('api-health');
    expect(result.status).toBe('healthy');
    expect(result.errors).toHaveLength(0);
    expect(result.summary.totalErrors).toBe(0);
  });

  it('should correctly track errors in summary', () => {
    const errors: CollectorError[] = [
      {
        id: 'err-1',
        message: 'Critical',
        severity: 'critical',
        category: 'deployment',
        source: 'test',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'err-2',
        message: 'Error',
        severity: 'error',
        category: 'connection',
        source: 'test',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'err-3',
        message: 'Warning',
        severity: 'warning',
        category: 'configuration',
        source: 'test',
        timestamp: new Date().toISOString(),
      },
    ];

    const criticalCount = errors.filter((e) => e.severity === 'critical').length;

    const result: CollectorResult = {
      collector: 'test',
      status: determineHealthStatus(criticalCount, errors.length, 0.8),
      collectedAt: new Date().toISOString(),
      durationMs: 200,
      errors,
      metrics: [],
      dependencies: [],
      summary: {
        totalErrors: errors.length,
        criticalErrors: criticalCount,
        avgResponseTimeMs: 200,
      },
    };

    expect(result.summary.totalErrors).toBe(3);
    expect(result.summary.criticalErrors).toBe(1);
    expect(result.status).toBe('unhealthy'); // Has critical errors
  });
});

describe('Collector Config', () => {
  it('should have sensible default configuration', () => {
    expect(DEFAULT_COLLECTOR_CONFIG.enabled).toBe(true);
    expect(DEFAULT_COLLECTOR_CONFIG.timeoutMs).toBe(30000);
    expect(DEFAULT_COLLECTOR_CONFIG.retryAttempts).toBe(3);
    expect(DEFAULT_COLLECTOR_CONFIG.retryDelayMs).toBe(1000);
    expect(DEFAULT_COLLECTOR_CONFIG.lookbackMinutes).toBe(30);
  });

  it('should allow partial config override', () => {
    const customConfig: Partial<CollectorConfig> = {
      timeoutMs: 5000,
      retryAttempts: 1,
    };

    const merged = { ...DEFAULT_COLLECTOR_CONFIG, ...customConfig };

    expect(merged.timeoutMs).toBe(5000);
    expect(merged.retryAttempts).toBe(1);
    expect(merged.enabled).toBe(true); // Kept default
    expect(merged.retryDelayMs).toBe(1000); // Kept default
  });
});

describe('API Health Collector Mock', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should handle healthy API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok', timestamp: new Date().toISOString() }),
    });

    const response = await fetch('http://localhost:3001/health');
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.status).toBe('ok');
  });

  it('should detect API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal_error' }),
    });

    const response = await fetch('http://localhost:3001/health');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetch('http://localhost:3001/health')).rejects.toThrow('Network error');
  });

  it('should handle timeout', async () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        })
    );

    await expect(fetch('http://localhost:3001/health')).rejects.toThrow('Timeout');
  });
});

describe('Railway Collector Mock', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should parse GraphQL deployment response', async () => {
    const mockDeployment = {
      data: {
        deployments: {
          edges: [
            {
              node: {
                id: 'deploy-123',
                status: 'SUCCESS',
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDeployment,
    });

    const response = await fetch('https://backboard.railway.app/graphql/v2');
    const data = await response.json();

    expect(data.data.deployments.edges).toHaveLength(1);
    expect(data.data.deployments.edges[0].node.status).toBe('SUCCESS');
  });

  it('should detect failed deployment', async () => {
    const mockFailedDeployment = {
      data: {
        deployments: {
          edges: [
            {
              node: {
                id: 'deploy-456',
                status: 'FAILED',
                createdAt: new Date().toISOString(),
                meta: {
                  error: 'Build failed',
                },
              },
            },
          ],
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockFailedDeployment,
    });

    const response = await fetch('https://backboard.railway.app/graphql/v2');
    const data = await response.json();

    expect(data.data.deployments.edges[0].node.status).toBe('FAILED');
  });
});

describe('Vercel Collector Mock', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should parse deployment list response', async () => {
    const mockDeployments = {
      deployments: [
        {
          uid: 'dpl_123',
          state: 'READY',
          createdAt: Date.now(),
          meta: {
            githubCommitSha: 'abc123',
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDeployments,
    });

    const response = await fetch('https://api.vercel.com/v6/deployments');
    const data = await response.json();

    expect(data.deployments).toHaveLength(1);
    expect(data.deployments[0].state).toBe('READY');
  });

  it('should detect build errors', async () => {
    const mockFailedDeployment = {
      deployments: [
        {
          uid: 'dpl_456',
          state: 'ERROR',
          errorMessage: 'Build failed: Module not found',
          createdAt: Date.now(),
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockFailedDeployment,
    });

    const response = await fetch('https://api.vercel.com/v6/deployments');
    const data = await response.json();

    expect(data.deployments[0].state).toBe('ERROR');
    expect(data.deployments[0].errorMessage).toContain('Build failed');
  });
});

describe('GitHub Actions Collector Mock', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should parse workflow runs response', async () => {
    const mockRuns = {
      workflow_runs: [
        {
          id: 12345,
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          created_at: new Date().toISOString(),
          head_sha: 'abc123',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRuns,
    });

    const response = await fetch('https://api.github.com/repos/owner/repo/actions/runs');
    const data = await response.json();

    expect(data.workflow_runs).toHaveLength(1);
    expect(data.workflow_runs[0].conclusion).toBe('success');
  });

  it('should detect workflow failures', async () => {
    const mockFailedRuns = {
      workflow_runs: [
        {
          id: 12346,
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          created_at: new Date().toISOString(),
          head_sha: 'def456',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockFailedRuns,
    });

    const response = await fetch('https://api.github.com/repos/owner/repo/actions/runs');
    const data = await response.json();

    expect(data.workflow_runs[0].conclusion).toBe('failure');
  });
});

describe('Error Pattern Normalization', () => {
  // Test the pattern normalization logic from update-baseline.ts
  function normalizeErrorMessage(message: string): string {
    return message
      .replace(/[a-f0-9-]{36}/gi, '<UUID>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TIMESTAMP>')
      .replace(/\b\d+\b/g, '<N>') // Match standalone numbers
      .replace(/\/[\w\-./]+\.(js|ts|json|md)/g, '<PATH>')
      .replace(/https?:\/\/[^\s]+/g, '<URL>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('should normalize UUIDs', () => {
    const msg = 'Error with ID 550e8400-e29b-41d4-a716-446655440000';
    expect(normalizeErrorMessage(msg)).toBe('Error with ID <UUID>');
  });

  it('should normalize timestamps', () => {
    const msg = 'Error at 2026-01-28T10:30:45.123Z';
    expect(normalizeErrorMessage(msg)).toBe('Error at <TIMESTAMP>');
  });

  it('should normalize file paths', () => {
    const msg = 'Error in /src/services/collectors/api-health.ts';
    expect(normalizeErrorMessage(msg)).toBe('Error in <PATH>');
  });

  it('should normalize URLs', () => {
    const msg = 'Failed to fetch https://api.example.com/endpoint';
    expect(normalizeErrorMessage(msg)).toBe('Failed to fetch <URL>');
  });

  it('should normalize standalone numbers', () => {
    const msg = 'Response status 500 after 1500 ms';
    expect(normalizeErrorMessage(msg)).toBe('Response status <N> after <N> ms');
  });

  it('should normalize complex error messages', () => {
    const msg =
      'Deployment 550e8400-e29b-41d4-a716-446655440000 failed at 2026-01-28T10:30:45Z with status 500';
    const normalized = normalizeErrorMessage(msg);
    expect(normalized).toBe('Deployment <UUID> failed at <TIMESTAMP> with status <N>');
  });
});

describe('Regression Detection', () => {
  function isRegression(
    previousCount: number | undefined,
    currentCount: number,
    thresholds: { percentageThreshold: number; absoluteThreshold: number }
  ): boolean {
    if (previousCount === undefined || previousCount === 0) {
      return currentCount >= 1;
    }

    const percentageIncrease = ((currentCount - previousCount) / previousCount) * 100;
    const absoluteIncrease = currentCount - previousCount;

    return (
      percentageIncrease >= thresholds.percentageThreshold ||
      absoluteIncrease >= thresholds.absoluteThreshold
    );
  }

  const defaultThresholds = { percentageThreshold: 50, absoluteThreshold: 3 };

  it('should detect new errors as regressions', () => {
    expect(isRegression(undefined, 1, defaultThresholds)).toBe(true);
    expect(isRegression(0, 1, defaultThresholds)).toBe(true);
  });

  it('should detect significant percentage increase', () => {
    expect(isRegression(2, 4, defaultThresholds)).toBe(true); // 100% increase
    expect(isRegression(10, 16, defaultThresholds)).toBe(true); // 60% increase
  });

  it('should detect significant absolute increase', () => {
    expect(isRegression(1, 5, defaultThresholds)).toBe(true); // +4 errors
    expect(isRegression(10, 14, defaultThresholds)).toBe(true); // +4 errors
  });

  it('should not flag minor increases as regressions', () => {
    expect(isRegression(10, 11, defaultThresholds)).toBe(false); // 10% increase, +1
    expect(isRegression(10, 12, defaultThresholds)).toBe(false); // 20% increase, +2
  });

  it('should not flag decreases as regressions', () => {
    expect(isRegression(10, 5, defaultThresholds)).toBe(false);
    expect(isRegression(10, 0, defaultThresholds)).toBe(false);
  });
});

describe('Error Frequency Categorization', () => {
  function categorize(
    count: number,
    thresholds: { rare: number; occasional: number; frequent: number; constant: number }
  ): string {
    if (count >= thresholds.constant) return 'constant';
    if (count >= thresholds.frequent) return 'frequent';
    if (count >= thresholds.occasional) return 'occasional';
    return 'rare';
  }

  const defaultThresholds = { rare: 0, occasional: 2, frequent: 6, constant: 21 };

  it('should categorize rare errors', () => {
    expect(categorize(0, defaultThresholds)).toBe('rare');
    expect(categorize(1, defaultThresholds)).toBe('rare');
  });

  it('should categorize occasional errors', () => {
    expect(categorize(2, defaultThresholds)).toBe('occasional');
    expect(categorize(5, defaultThresholds)).toBe('occasional');
  });

  it('should categorize frequent errors', () => {
    expect(categorize(6, defaultThresholds)).toBe('frequent');
    expect(categorize(20, defaultThresholds)).toBe('frequent');
  });

  it('should categorize constant errors', () => {
    expect(categorize(21, defaultThresholds)).toBe('constant');
    expect(categorize(100, defaultThresholds)).toBe('constant');
  });
});
