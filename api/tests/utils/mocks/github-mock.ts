/**
 * GitHub API Mock Service
 *
 * Mocks GitHub REST API for testing without actual API calls.
 * Supports repository content, README extraction, and rate limiting.
 */

import { BaseMockService, MockServiceConfig, RateLimitState, maskToken } from './types.js';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  language: string | null;
  default_branch: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
  topics?: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  content?: string;  // Base64 encoded for files
  encoding?: string;
  download_url: string | null;
  html_url: string;
}

export interface GitHubRateLimit {
  rate: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  };
  resources: {
    core: RateLimitState & { used: number };
    search: RateLimitState & { used: number };
  };
}

export interface GitHubMockConfig extends MockServiceConfig {
  /** Starting rate limit remaining */
  initialRateLimit?: number;
  /** Rate limit per hour */
  rateLimitPerHour?: number;
}

interface MockRepoData {
  repo: GitHubRepo;
  readme?: string;
  files?: Map<string, string>;
}

/**
 * GitHub API Mock Service
 */
export class GitHubMockService extends BaseMockService {
  name = 'GitHubAPI';

  private repos: Map<string, MockRepoData> = new Map();
  private rateLimit: RateLimitState;
  private rateLimitPerHour: number;
  private validTokens: Set<string> = new Set();
  private failureScenarios: Map<string, { status: number; message: string }> = new Map();

  constructor(config: GitHubMockConfig = {}) {
    super(config);
    this.rateLimitPerHour = config.rateLimitPerHour || 5000;
    this.rateLimit = {
      remaining: config.initialRateLimit || this.rateLimitPerHour,
      limit: this.rateLimitPerHour,
      reset: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  /**
   * Register a valid authentication token
   */
  addValidToken(token: string): void {
    this.validTokens.add(token);
  }

  /**
   * Add a mock repository
   */
  addRepo(owner: string, name: string, data: Partial<GitHubRepo> & { readme?: string; files?: Record<string, string> }): void {
    const fullName = `${owner}/${name}`;
    const repo: GitHubRepo = {
      id: Math.floor(Math.random() * 1000000),
      name,
      full_name: fullName,
      description: data.description || null,
      html_url: `https://github.com/${fullName}`,
      stargazers_count: data.stargazers_count || 0,
      forks_count: data.forks_count || 0,
      watchers_count: data.watchers_count || 0,
      language: data.language || null,
      default_branch: data.default_branch || 'main',
      private: data.private || false,
      owner: data.owner || {
        login: owner,
        avatar_url: `https://avatars.githubusercontent.com/u/${Math.floor(Math.random() * 1000000)}`,
        type: 'User',
      },
      topics: data.topics || [],
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
      pushed_at: data.pushed_at || new Date().toISOString(),
    };

    const files = new Map<string, string>();
    if (data.files) {
      for (const [path, content] of Object.entries(data.files)) {
        files.set(path, content);
      }
    }

    this.repos.set(fullName.toLowerCase(), {
      repo,
      readme: data.readme,
      files,
    });
  }

  /**
   * Set a failure scenario for a specific repo
   */
  setFailure(owner: string, name: string, status: number, message: string): void {
    this.failureScenarios.set(`${owner}/${name}`.toLowerCase(), { status, message });
  }

  /**
   * Clear a failure scenario
   */
  clearFailure(owner: string, name: string): void {
    this.failureScenarios.delete(`${owner}/${name}`.toLowerCase());
  }

  /**
   * Set remaining rate limit
   */
  setRateLimit(remaining: number): void {
    this.rateLimit.remaining = remaining;
  }

  /**
   * Check if token is valid
   */
  private validateToken(token?: string): boolean {
    // If no tokens registered, accept all (testing mode)
    if (this.validTokens.size === 0) return true;
    if (!token) return false;
    return this.validTokens.has(token);
  }

  /**
   * Consume rate limit
   */
  private consumeRateLimit(): void {
    if (this.rateLimit.remaining > 0) {
      this.rateLimit.remaining--;
    }
  }

  /**
   * Get rate limit headers
   */
  getRateLimitHeaders(): Record<string, string> {
    return {
      'x-ratelimit-limit': String(this.rateLimit.limit),
      'x-ratelimit-remaining': String(this.rateLimit.remaining),
      'x-ratelimit-reset': String(this.rateLimit.reset),
    };
  }

  /**
   * Mock: GET /repos/{owner}/{repo}
   */
  async getRepo(owner: string, name: string, token?: string): Promise<GitHubRepo> {
    this.recordCall({ method: 'GET', url: `/repos/${owner}/${name}`, headers: { Authorization: `Bearer ${maskToken(token)}` } });

    // Check rate limit
    if (this.rateLimit.remaining <= 0) {
      throw { status: 403, message: 'API rate limit exceeded', headers: this.getRateLimitHeaders() };
    }
    this.consumeRateLimit();

    // Check auth
    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Bad credentials' };
    }

    const key = `${owner}/${name}`.toLowerCase();

    // Check failure scenarios
    const failure = this.failureScenarios.get(key);
    if (failure) {
      throw { status: failure.status, message: failure.message };
    }

    // Get repo
    const repoData = this.repos.get(key);
    if (!repoData) {
      throw { status: 404, message: 'Not Found' };
    }

    return repoData.repo;
  }

  /**
   * Mock: GET /repos/{owner}/{repo}/readme
   */
  async getReadme(owner: string, name: string, token?: string): Promise<GitHubContent> {
    this.recordCall({ method: 'GET', url: `/repos/${owner}/${name}/readme`, headers: { Authorization: `Bearer ${maskToken(token)}` } });

    // Check rate limit
    if (this.rateLimit.remaining <= 0) {
      throw { status: 403, message: 'API rate limit exceeded', headers: this.getRateLimitHeaders() };
    }
    this.consumeRateLimit();

    // Check auth
    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Bad credentials' };
    }

    const key = `${owner}/${name}`.toLowerCase();

    // Check failure scenarios
    const failure = this.failureScenarios.get(key);
    if (failure) {
      throw { status: failure.status, message: failure.message };
    }

    // Get repo
    const repoData = this.repos.get(key);
    if (!repoData) {
      throw { status: 404, message: 'Not Found' };
    }

    if (!repoData.readme) {
      throw { status: 404, message: 'Not Found' };
    }

    const content = Buffer.from(repoData.readme).toString('base64');
    return {
      name: 'README.md',
      path: 'README.md',
      sha: this.generateSha(),
      size: repoData.readme.length,
      type: 'file',
      content,
      encoding: 'base64',
      download_url: `https://raw.githubusercontent.com/${owner}/${name}/main/README.md`,
      html_url: `https://github.com/${owner}/${name}/blob/main/README.md`,
    };
  }

  /**
   * Mock: GET /repos/{owner}/{repo}/contents/{path}
   */
  async getContent(owner: string, name: string, path: string, token?: string): Promise<GitHubContent> {
    this.recordCall({ method: 'GET', url: `/repos/${owner}/${name}/contents/${path}`, headers: { Authorization: `Bearer ${maskToken(token)}` } });

    // Check rate limit
    if (this.rateLimit.remaining <= 0) {
      throw { status: 403, message: 'API rate limit exceeded', headers: this.getRateLimitHeaders() };
    }
    this.consumeRateLimit();

    // Check auth
    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Bad credentials' };
    }

    const key = `${owner}/${name}`.toLowerCase();

    // Get repo
    const repoData = this.repos.get(key);
    if (!repoData) {
      throw { status: 404, message: 'Not Found' };
    }

    const fileContent = repoData.files?.get(path);
    if (!fileContent) {
      throw { status: 404, message: 'Not Found' };
    }

    const content = Buffer.from(fileContent).toString('base64');
    return {
      name: path.split('/').pop() || path,
      path,
      sha: this.generateSha(),
      size: fileContent.length,
      type: 'file',
      content,
      encoding: 'base64',
      download_url: `https://raw.githubusercontent.com/${owner}/${name}/main/${path}`,
      html_url: `https://github.com/${owner}/${name}/blob/main/${path}`,
    };
  }

  /**
   * Mock: GET /rate_limit
   */
  async getRateLimit(): Promise<GitHubRateLimit> {
    this.recordCall({ method: 'GET', url: '/rate_limit' });

    return {
      rate: {
        limit: this.rateLimit.limit,
        remaining: this.rateLimit.remaining,
        reset: this.rateLimit.reset,
        used: this.rateLimit.limit - this.rateLimit.remaining,
      },
      resources: {
        core: {
          limit: this.rateLimit.limit,
          remaining: this.rateLimit.remaining,
          reset: this.rateLimit.reset,
          used: this.rateLimit.limit - this.rateLimit.remaining,
        },
        search: {
          limit: 30,
          remaining: 30,
          reset: this.rateLimit.reset,
          used: 0,
        },
      },
    };
  }

  /**
   * Generate a fake SHA
   */
  private generateSha(): string {
    return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Reset the mock service
   */
  override reset(): void {
    super.reset();
    this.repos.clear();
    this.validTokens.clear();
    this.failureScenarios.clear();
    this.rateLimit = {
      remaining: this.rateLimitPerHour,
      limit: this.rateLimitPerHour,
      reset: Math.floor(Date.now() / 1000) + 3600,
    };
  }
}

// Export singleton instance
export const githubMock = new GitHubMockService();
