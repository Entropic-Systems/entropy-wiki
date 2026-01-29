/**
 * Mock Service Manager
 *
 * Central orchestration for all external API mocking.
 * Provides unified interface for setting up, tearing down, and validating mocks.
 */

import { IMockService, MockCall } from './types.js';
import { GitHubMockService, githubMock } from './github-mock.js';
import { ClaudeMockService, claudeMock } from './claude-mock.js';
import { TwitterMockService, twitterMock } from './twitter-mock.js';
import { RailwayMockService, railwayMock } from './railway-mock.js';
import { VercelMockService, vercelMock } from './vercel-mock.js';
import { scenarios, applyScenario, teardownScenario, resetAllMocks } from './mock-scenarios.js';

export interface MockManagerConfig {
  /** Enable verbose logging across all mocks */
  verbose?: boolean;
  /** Track all API calls across all mocks */
  trackCalls?: boolean;
  /** Default scenario to apply on setup */
  defaultScenario?: keyof typeof scenarios;
}

export interface CallValidation {
  service: string;
  method: string;
  urlPattern: string | RegExp;
  minCalls?: number;
  maxCalls?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  callCounts: Record<string, number>;
}

/**
 * Centralized Mock Service Manager
 *
 * Coordinates all mock services and provides unified testing interface.
 */
export class MockServiceManager {
  private config: Required<MockManagerConfig>;

  // Individual mock service instances
  readonly github: GitHubMockService;
  readonly claude: ClaudeMockService;
  readonly twitter: TwitterMockService;
  readonly railway: RailwayMockService;
  readonly vercel: VercelMockService;

  // All services as array for iteration
  private services: IMockService[];

  constructor(config: MockManagerConfig = {}) {
    this.config = {
      verbose: config.verbose || false,
      trackCalls: config.trackCalls ?? true,
      defaultScenario: config.defaultScenario || 'happyPath',
    };

    // Use singleton instances
    this.github = githubMock;
    this.claude = claudeMock;
    this.twitter = twitterMock;
    this.railway = railwayMock;
    this.vercel = vercelMock;

    this.services = [
      this.github,
      this.claude,
      this.twitter,
      this.railway,
      this.vercel,
    ];
  }

  /**
   * Set up mocks with default scenario
   */
  setupDefaults(): void {
    this.reset();
    applyScenario(this.config.defaultScenario);

    if (this.config.verbose) {
      console.log(`[MockServiceManager] Applied scenario: ${this.config.defaultScenario}`);
    }
  }

  /**
   * Apply a specific scenario
   */
  applyScenario(name: keyof typeof scenarios): void {
    applyScenario(name);

    if (this.config.verbose) {
      console.log(`[MockServiceManager] Applied scenario: ${name}`);
    }
  }

  /**
   * Tear down a specific scenario
   */
  teardownScenario(name: keyof typeof scenarios): void {
    teardownScenario(name);

    if (this.config.verbose) {
      console.log(`[MockServiceManager] Torn down scenario: ${name}`);
    }
  }

  /**
   * Reset all mock services to clean state
   */
  reset(): void {
    resetAllMocks();

    if (this.config.verbose) {
      console.log('[MockServiceManager] All mocks reset');
    }
  }

  /**
   * Get all recorded calls across all services
   */
  getAllCalls(): Array<MockCall & { service: string }> {
    const allCalls: Array<MockCall & { service: string }> = [];

    for (const service of this.services) {
      for (const call of service.getCalls()) {
        allCalls.push({ ...call, service: service.name });
      }
    }

    // Sort by timestamp
    return allCalls.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get calls for a specific service
   */
  getCallsForService(serviceName: string): MockCall[] {
    const service = this.services.find(s => s.name === serviceName);
    return service?.getCalls() || [];
  }

  /**
   * Clear all recorded calls
   */
  clearAllCalls(): void {
    for (const service of this.services) {
      service.clearCalls();
    }
  }

  /**
   * Validate expected API calls were made
   */
  validateCalls(expectations: CallValidation[]): ValidationResult {
    const errors: string[] = [];
    const callCounts: Record<string, number> = {};

    for (const expectation of expectations) {
      const service = this.services.find(s => s.name === expectation.service);
      if (!service) {
        errors.push(`Unknown service: ${expectation.service}`);
        continue;
      }

      const calls = service.getCalls().filter(call => {
        if (call.method !== expectation.method) return false;

        if (typeof expectation.urlPattern === 'string') {
          return call.url.includes(expectation.urlPattern);
        }
        return expectation.urlPattern.test(call.url);
      });

      const key = `${expectation.service}:${expectation.method}:${expectation.urlPattern}`;
      callCounts[key] = calls.length;

      if (expectation.minCalls !== undefined && calls.length < expectation.minCalls) {
        errors.push(
          `Expected at least ${expectation.minCalls} calls to ${key}, got ${calls.length}`
        );
      }

      if (expectation.maxCalls !== undefined && calls.length > expectation.maxCalls) {
        errors.push(
          `Expected at most ${expectation.maxCalls} calls to ${key}, got ${calls.length}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      callCounts,
    };
  }

  /**
   * Assert that a specific call was made
   */
  assertCalled(service: string, method: string, urlPattern: string | RegExp): void {
    const result = this.validateCalls([
      { service, method, urlPattern, minCalls: 1 },
    ]);

    if (!result.valid) {
      throw new Error(result.errors.join('\n'));
    }
  }

  /**
   * Assert that a specific call was NOT made
   */
  assertNotCalled(service: string, method: string, urlPattern: string | RegExp): void {
    const result = this.validateCalls([
      { service, method, urlPattern, maxCalls: 0 },
    ]);

    if (!result.valid) {
      throw new Error(result.errors.join('\n'));
    }
  }

  /**
   * Get summary of all mock activity
   */
  getSummary(): {
    totalCalls: number;
    callsByService: Record<string, number>;
    callsByMethod: Record<string, number>;
  } {
    const allCalls = this.getAllCalls();
    const callsByService: Record<string, number> = {};
    const callsByMethod: Record<string, number> = {};

    for (const call of allCalls) {
      callsByService[call.service] = (callsByService[call.service] || 0) + 1;
      callsByMethod[call.method] = (callsByMethod[call.method] || 0) + 1;
    }

    return {
      totalCalls: allCalls.length,
      callsByService,
      callsByMethod,
    };
  }

  /**
   * Print debug information
   */
  debug(): void {
    const summary = this.getSummary();
    console.log('\n=== Mock Service Manager Debug ===');
    console.log(`Total calls: ${summary.totalCalls}`);
    console.log('\nCalls by service:');
    for (const [service, count] of Object.entries(summary.callsByService)) {
      console.log(`  ${service}: ${count}`);
    }
    console.log('\nCalls by method:');
    for (const [method, count] of Object.entries(summary.callsByMethod)) {
      console.log(`  ${method}: ${count}`);
    }
    console.log('\nAll calls:');
    for (const call of this.getAllCalls()) {
      console.log(`  [${call.service}] ${call.method} ${call.url}`);
    }
    console.log('=================================\n');
  }
}

// Export singleton instance
export const mockManager = new MockServiceManager();

// Export individual mock services for direct access
export { githubMock, claudeMock, twitterMock, railwayMock, vercelMock };

// Export scenarios
export { scenarios, applyScenario, teardownScenario, resetAllMocks };
