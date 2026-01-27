/**
 * GitHub Actions CI Collector
 *
 * Monitors GitHub Actions workflow status, job failures, and test results.
 * Queries GitHub REST API for CI/CD pipeline status and provides
 * comprehensive error analysis and tracking.
 *
 * Features:
 * - Workflow run status tracking
 * - Job-level failure analysis
 * - Test result parsing (via check runs)
 * - Commit correlation
 * - Integration with existing entropy-wiki GitHub Actions infrastructure
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

// GitHub API response types
interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  workflow_id: number;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  run_attempt: number;
  event: string;
  actor: {
    login: string;
  };
}

interface WorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps?: JobStep[];
}

interface JobStep {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  number: number;
  started_at?: string;
  completed_at?: string;
}

interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

interface JobsResponse {
  total_count: number;
  jobs: WorkflowJob[];
}

interface GitHubActionsConfig extends CollectorConfig {
  owner: string;
  repo: string;
  token?: string;
  workflows?: string[]; // Workflow names to monitor (empty = all)
  branch?: string; // Filter by branch
}

const DEFAULT_GITHUB_CONFIG: GitHubActionsConfig = {
  ...DEFAULT_COLLECTOR_CONFIG,
  owner: '',
  repo: '',
  workflows: ['Test'], // Default workflow in entropy-wiki
  lookbackMinutes: 60 * 24, // Default to last 24 hours for CI
};

export class GithubActionsCollector implements Collector {
  public readonly name = 'github-actions';

  private config: GitHubActionsConfig;
  private baseUrl = 'https://api.github.com';

  constructor(config?: Partial<GitHubActionsConfig>) {
    // Extract owner/repo from env or config
    const owner = config?.owner || process.env.GITHUB_REPOSITORY_OWNER || '';
    const repo = config?.repo || process.env.GITHUB_REPOSITORY?.split('/')[1] || '';

    this.config = {
      ...DEFAULT_GITHUB_CONFIG,
      ...config,
      owner,
      repo,
      token: config?.token || process.env.GITHUB_TOKEN,
    };
  }

  /**
   * Perform a quick health check - returns overall CI status
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.config.owner || !this.config.repo) {
      return 'unknown';
    }

    try {
      const runs = await this.fetchWorkflowRuns(1);
      if (runs.total_count === 0) {
        return 'unknown';
      }

      const latestRun = runs.workflow_runs[0];
      if (latestRun.status !== 'completed') {
        return 'degraded'; // In progress
      }

      return latestRun.conclusion === 'success' ? 'healthy' : 'unhealthy';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Collect comprehensive GitHub Actions data
   */
  async collect(config?: Partial<GitHubActionsConfig>): Promise<CollectorResult> {
    const mergedConfig = { ...this.config, ...config };
    const startTime = Date.now();

    const errors: CollectorError[] = [];
    const metrics: HealthMetrics[] = [];
    const dependencies: DependencyStatus[] = [];

    // Validate configuration
    if (!mergedConfig.owner || !mergedConfig.repo) {
      return this.createErrorResult(
        'Configuration error: owner and repo are required. Set GITHUB_REPOSITORY env var.',
        startTime
      );
    }

    try {
      // Fetch recent workflow runs
      const lookbackDate = new Date(Date.now() - (mergedConfig.lookbackMinutes || 60) * 60 * 1000);
      const runs = await this.fetchWorkflowRuns(50, mergedConfig.branch);

      // Filter by lookback time and workflow names
      const relevantRuns = runs.workflow_runs.filter(run => {
        const runTime = new Date(run.created_at);
        const withinTimeWindow = runTime >= lookbackDate;
        const matchesWorkflow = !mergedConfig.workflows?.length ||
          mergedConfig.workflows.includes(run.name);
        return withinTimeWindow && matchesWorkflow;
      });

      // Process each run
      let successCount = 0;
      let failureCount = 0;
      let totalDurationMs = 0;

      for (const run of relevantRuns) {
        const runResult = await this.processWorkflowRun(run, mergedConfig);

        metrics.push(runResult.metrics);
        totalDurationMs += runResult.metrics.responseTimeMs;

        if (runResult.metrics.success) {
          successCount++;
        } else {
          failureCount++;
        }

        if (runResult.errors.length > 0) {
          errors.push(...runResult.errors);
        }
      }

      // Create dependency status for GitHub Actions
      const successRate = relevantRuns.length > 0
        ? successCount / relevantRuns.length
        : 1;

      dependencies.push({
        name: 'github-actions',
        status: this.statusFromSuccessRate(successRate),
        latencyMs: totalDurationMs,
        lastChecked: new Date().toISOString(),
        message: `${successCount}/${relevantRuns.length} runs successful`,
        details: {
          totalRuns: relevantRuns.length,
          successCount,
          failureCount,
          inProgress: relevantRuns.filter(r => r.status !== 'completed').length,
        },
      });

      const durationMs = Date.now() - startTime;
      const criticalErrors = errors.filter(e => e.severity === 'critical').length;

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
          avgResponseTimeMs: relevantRuns.length > 0
            ? Math.round(totalDurationMs / relevantRuns.length)
            : 0,
          uptime: successRate * 100,
        },
        raw: {
          totalRuns: runs.total_count,
          relevantRuns: relevantRuns.length,
          lookbackMinutes: mergedConfig.lookbackMinutes,
          workflows: mergedConfig.workflows,
        },
      };
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error fetching GitHub Actions data',
        startTime
      );
    }
  }

  /**
   * Process a single workflow run
   */
  private async processWorkflowRun(
    run: WorkflowRun,
    config: GitHubActionsConfig
  ): Promise<{
    metrics: HealthMetrics;
    errors: CollectorError[];
  }> {
    const errors: CollectorError[] = [];

    // Calculate run duration
    const startedAt = run.run_started_at ? new Date(run.run_started_at) : new Date(run.created_at);
    const updatedAt = new Date(run.updated_at);
    const durationMs = updatedAt.getTime() - startedAt.getTime();

    const isSuccess = run.conclusion === 'success';
    const isComplete = run.status === 'completed';

    const metrics: HealthMetrics = {
      responseTimeMs: durationMs,
      statusCode: this.conclusionToStatusCode(run.conclusion),
      success: isSuccess,
      timestamp: run.updated_at,
    };

    // If failed or has issues, get job details
    if (isComplete && !isSuccess && run.conclusion) {
      try {
        const jobs = await this.fetchWorkflowJobs(run.id);
        const failedJobs = jobs.jobs.filter(j => j.conclusion === 'failure');

        for (const job of failedJobs) {
          const error = this.createJobError(run, job);
          errors.push(error);
        }

        // If no specific job failures, create run-level error
        if (failedJobs.length === 0 && run.conclusion !== 'cancelled') {
          errors.push(this.createRunError(run));
        }
      } catch {
        // If we can't fetch jobs, create a generic run error
        errors.push(this.createRunError(run));
      }
    }

    return { metrics, errors };
  }

  /**
   * Create an error from a failed job
   */
  private createJobError(run: WorkflowRun, job: WorkflowJob): CollectorError {
    const failedSteps = job.steps?.filter(s => s.conclusion === 'failure') || [];
    const failedStepNames = failedSteps.map(s => s.name).join(', ');

    return {
      id: generateErrorId(this.name),
      timestamp: job.completed_at || run.updated_at,
      severity: this.determineSeverity(run, job),
      category: this.categorizeJobFailure(job),
      message: failedStepNames
        ? `Job "${job.name}" failed at: ${failedStepNames}`
        : `Job "${job.name}" failed`,
      source: `${this.name}:${run.name}/${job.name}`,
      details: {
        runId: run.id,
        jobId: job.id,
        workflow: run.name,
        branch: run.head_branch,
        sha: run.head_sha.substring(0, 7),
        actor: run.actor.login,
        event: run.event,
        attempt: run.run_attempt,
        jobUrl: job.html_url,
        failedSteps: failedSteps.map(s => ({
          name: s.name,
          number: s.number,
        })),
      },
    };
  }

  /**
   * Create an error from a failed run (when job details unavailable)
   */
  private createRunError(run: WorkflowRun): CollectorError {
    return {
      id: generateErrorId(this.name),
      timestamp: run.updated_at,
      severity: run.conclusion === 'timed_out' ? 'critical' : 'error',
      category: this.categorizeRunConclusion(run.conclusion),
      message: `Workflow "${run.name}" ${run.conclusion || 'failed'}`,
      source: `${this.name}:${run.name}`,
      details: {
        runId: run.id,
        workflow: run.name,
        branch: run.head_branch,
        sha: run.head_sha.substring(0, 7),
        actor: run.actor.login,
        event: run.event,
        attempt: run.run_attempt,
        runUrl: run.html_url,
        conclusion: run.conclusion,
      },
    };
  }

  /**
   * Fetch workflow runs from GitHub API
   */
  private async fetchWorkflowRuns(perPage: number = 30, branch?: string): Promise<WorkflowRunsResponse> {
    const params = new URLSearchParams({
      per_page: perPage.toString(),
    });

    if (branch) {
      params.set('branch', branch);
    }

    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/actions/runs?${params}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as WorkflowRunsResponse;
  }

  /**
   * Fetch jobs for a workflow run
   */
  private async fetchWorkflowJobs(runId: number): Promise<JobsResponse> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/actions/runs/${runId}/jobs`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as JobsResponse;
  }

  /**
   * Fetch with authorization and timeout
   */
  private async fetchWithAuth(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'entropy-wiki-debug-collector',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Determine error severity based on run and job context
   */
  private determineSeverity(run: WorkflowRun, job: WorkflowJob): ErrorSeverity {
    // Critical failures on main/master branches
    if (run.head_branch === 'master' || run.head_branch === 'main') {
      return 'critical';
    }

    // Critical if this is a deployment workflow
    if (run.name.toLowerCase().includes('deploy')) {
      return 'critical';
    }

    // Check for test failures in specific jobs
    if (job.name.toLowerCase().includes('test')) {
      return 'error';
    }

    return 'warning';
  }

  /**
   * Categorize job failure type
   */
  private categorizeJobFailure(job: WorkflowJob): ErrorCategory {
    const name = job.name.toLowerCase();
    const failedSteps = job.steps?.filter(s => s.conclusion === 'failure') || [];
    const stepNames = failedSteps.map(s => s.name.toLowerCase()).join(' ');

    // Check step names for hints
    if (stepNames.includes('test') || stepNames.includes('spec')) {
      return 'validation';
    }
    if (stepNames.includes('build')) {
      return 'deployment';
    }
    if (stepNames.includes('lint') || stepNames.includes('format')) {
      return 'validation';
    }
    if (stepNames.includes('deploy')) {
      return 'deployment';
    }
    if (stepNames.includes('install') || stepNames.includes('setup')) {
      return 'configuration';
    }
    if (stepNames.includes('migrate') || stepNames.includes('database')) {
      return 'database';
    }

    // Check job name
    if (name.includes('test')) return 'validation';
    if (name.includes('build')) return 'deployment';
    if (name.includes('deploy')) return 'deployment';
    if (name.includes('lint')) return 'validation';

    return 'runtime';
  }

  /**
   * Categorize run conclusion
   */
  private categorizeRunConclusion(conclusion: string | null): ErrorCategory {
    switch (conclusion) {
      case 'timed_out':
        return 'timeout';
      case 'cancelled':
        return 'runtime';
      case 'action_required':
        return 'authentication';
      default:
        return 'runtime';
    }
  }

  /**
   * Convert conclusion to HTTP-like status code for metrics
   */
  private conclusionToStatusCode(conclusion: string | null): number {
    switch (conclusion) {
      case 'success':
        return 200;
      case 'failure':
        return 500;
      case 'cancelled':
        return 499; // Client closed request
      case 'timed_out':
        return 504; // Gateway timeout
      case 'action_required':
        return 401; // Unauthorized
      case 'skipped':
        return 204; // No content
      default:
        return 0; // Unknown/in progress
    }
  }

  /**
   * Convert success rate to health status
   */
  private statusFromSuccessRate(rate: number): HealthStatus {
    if (rate >= 0.95) return 'healthy';
    if (rate >= 0.7) return 'degraded';
    return 'unhealthy';
  }

  /**
   * Create error result when collection fails
   */
  private createErrorResult(message: string, startTime: number): CollectorResult {
    return {
      collector: this.name,
      status: 'unknown',
      collectedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      errors: [{
        id: generateErrorId(this.name),
        timestamp: new Date().toISOString(),
        severity: 'error',
        category: 'configuration',
        message,
        source: this.name,
      }],
      metrics: [],
      dependencies: [{
        name: 'github-actions',
        status: 'unknown',
        lastChecked: new Date().toISOString(),
        message,
      }],
      summary: {
        totalErrors: 1,
        criticalErrors: 0,
        avgResponseTimeMs: 0,
      },
    };
  }
}

// Export singleton instance for convenience
export const githubActionsCollector = new GithubActionsCollector();

// Export factory function for custom configuration
export function createGithubActionsCollector(
  config?: Partial<GitHubActionsConfig>
): GithubActionsCollector {
  return new GithubActionsCollector(config);
}
