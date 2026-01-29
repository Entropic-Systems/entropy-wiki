/**
 * Mock Service Types
 *
 * Common types and interfaces for the mock management system.
 */

export interface MockCall {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timestamp: number;
}

export interface MockResponse<T = unknown> {
  status: number;
  data: T;
  headers?: Record<string, string>;
}

export interface MockScenario {
  name: string;
  description: string;
  setup: () => void;
  teardown?: () => void;
}

export interface MockServiceConfig {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Default response delay in ms */
  defaultDelay?: number;
  /** Track all API calls */
  trackCalls?: boolean;
}

export interface IMockService {
  name: string;
  reset(): void;
  getCalls(): MockCall[];
  clearCalls(): void;
}

/**
 * Base class for mock services
 */
export abstract class BaseMockService implements IMockService {
  abstract name: string;
  protected calls: MockCall[] = [];
  protected config: MockServiceConfig;

  constructor(config: MockServiceConfig = {}) {
    this.config = {
      verbose: false,
      defaultDelay: 0,
      trackCalls: true,
      ...config,
    };
  }

  protected recordCall(call: Omit<MockCall, 'timestamp'>): void {
    if (this.config.trackCalls) {
      this.calls.push({
        ...call,
        timestamp: Date.now(),
      });
    }
    if (this.config.verbose) {
      console.log(`[${this.name}] ${call.method} ${call.url}`);
    }
  }

  reset(): void {
    this.calls = [];
  }

  getCalls(): MockCall[] {
    return [...this.calls];
  }

  clearCalls(): void {
    this.calls = [];
  }

  getCallCount(): number {
    return this.calls.length;
  }

  hasCall(method: string, urlPattern: string | RegExp): boolean {
    return this.calls.some(call => {
      if (call.method !== method) return false;
      if (typeof urlPattern === 'string') {
        return call.url.includes(urlPattern);
      }
      return urlPattern.test(call.url);
    });
  }
}

/**
 * Error types for mock services
 */
export class MockApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'MockApiError';
  }
}

/**
 * Rate limit tracking
 */
export interface RateLimitState {
  remaining: number;
  limit: number;
  reset: number;
}

/**
 * Token masking utility
 */
export function maskToken(token: string | undefined): string {
  if (!token) return '[no-token]';
  if (token.length <= 8) return '[redacted]';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
