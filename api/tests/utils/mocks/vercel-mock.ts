/**
 * Vercel REST API Mock Service
 *
 * Mocks Vercel's REST API for testing deployment monitoring.
 */

import { BaseMockService, MockServiceConfig, maskToken } from './types.js';

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'INITIALIZING' | 'ANALYZING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED';
  readyState?: 'READY' | 'ERROR' | 'INITIALIZING' | 'BUILDING';
  created: number;
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  target?: 'production' | 'preview';
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitRef?: string;
  };
  inspectorUrl?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework?: string;
  devCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  nodeVersion?: string;
  createdAt: number;
  updatedAt: number;
  latestDeployments?: VercelDeployment[];
}

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface VercelMockConfig extends MockServiceConfig {
  /** Simulate response delay in ms */
  responseDelay?: number;
}

/**
 * Vercel REST API Mock Service
 */
export class VercelMockService extends BaseMockService {
  name = 'VercelAPI';

  private projects: Map<string, VercelProject> = new Map();
  private deployments: Map<string, VercelDeployment[]> = new Map();
  private teams: Map<string, VercelTeam> = new Map();
  private validTokens: Set<string> = new Set();
  private responseDelay: number;
  private failureScenarios: Map<string, { status: number; message: string }> = new Map();

  constructor(config: VercelMockConfig = {}) {
    super(config);
    this.responseDelay = config.responseDelay || 0;
  }

  /**
   * Register a valid authentication token
   */
  addValidToken(token: string): void {
    this.validTokens.add(token);
  }

  /**
   * Add a mock project
   */
  addProject(project: VercelProject): void {
    this.projects.set(project.id, project);
    this.deployments.set(project.id, project.latestDeployments || []);
  }

  /**
   * Add a deployment to a project
   */
  addDeployment(projectId: string, deployment: VercelDeployment): void {
    const deployments = this.deployments.get(projectId) || [];
    deployments.unshift(deployment);
    this.deployments.set(projectId, deployments);
  }

  /**
   * Add a mock team
   */
  addTeam(team: VercelTeam): void {
    this.teams.set(team.id, team);
  }

  /**
   * Set a failure scenario for an endpoint
   */
  setFailure(endpoint: string, status: number, message: string): void {
    this.failureScenarios.set(endpoint, { status, message });
  }

  /**
   * Clear a failure scenario
   */
  clearFailure(endpoint: string): void {
    this.failureScenarios.delete(endpoint);
  }

  /**
   * Validate token
   */
  private validateToken(token?: string): boolean {
    if (this.validTokens.size === 0) return true;
    if (!token) return false;
    return this.validTokens.has(token);
  }

  /**
   * Check for failure scenarios
   */
  private checkFailure(endpoint: string): { status: number; message: string } | null {
    for (const [pattern, failure] of this.failureScenarios) {
      if (endpoint.includes(pattern)) {
        return failure;
      }
    }
    return null;
  }

  /**
   * Mock: GET /v9/projects
   */
  async listProjects(token?: string, teamId?: string): Promise<{ projects: VercelProject[] }> {
    this.recordCall({
      method: 'GET',
      url: `/v9/projects${teamId ? `?teamId=${teamId}` : ''}`,
      headers: { Authorization: `Bearer ${maskToken(token)}` },
    });

    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Unauthorized' };
    }

    const failure = this.checkFailure('/v9/projects');
    if (failure) throw failure;

    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    return {
      projects: Array.from(this.projects.values()),
    };
  }

  /**
   * Mock: GET /v9/projects/{idOrName}
   */
  async getProject(idOrName: string, token?: string): Promise<VercelProject> {
    this.recordCall({
      method: 'GET',
      url: `/v9/projects/${idOrName}`,
      headers: { Authorization: `Bearer ${maskToken(token)}` },
    });

    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Unauthorized' };
    }

    const failure = this.checkFailure(`/v9/projects/${idOrName}`);
    if (failure) throw failure;

    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    // Find by ID or name
    let project = this.projects.get(idOrName);
    if (!project) {
      project = Array.from(this.projects.values()).find(p => p.name === idOrName);
    }

    if (!project) {
      throw { status: 404, message: 'Project not found' };
    }

    return project;
  }

  /**
   * Mock: GET /v6/deployments
   */
  async listDeployments(
    token?: string,
    options?: { projectId?: string; state?: string; limit?: number }
  ): Promise<{ deployments: VercelDeployment[] }> {
    const params = new URLSearchParams();
    if (options?.projectId) params.set('projectId', options.projectId);
    if (options?.state) params.set('state', options.state);
    if (options?.limit) params.set('limit', String(options.limit));

    this.recordCall({
      method: 'GET',
      url: `/v6/deployments?${params.toString()}`,
      headers: { Authorization: `Bearer ${maskToken(token)}` },
    });

    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Unauthorized' };
    }

    const failure = this.checkFailure('/v6/deployments');
    if (failure) throw failure;

    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    let allDeployments: VercelDeployment[] = [];

    if (options?.projectId) {
      allDeployments = this.deployments.get(options.projectId) || [];
    } else {
      allDeployments = Array.from(this.deployments.values()).flat();
    }

    // Filter by state if specified
    if (options?.state) {
      allDeployments = allDeployments.filter(d => d.state === options.state);
    }

    // Limit results
    if (options?.limit) {
      allDeployments = allDeployments.slice(0, options.limit);
    }

    return { deployments: allDeployments };
  }

  /**
   * Mock: GET /v13/deployments/{id}
   */
  async getDeployment(deploymentId: string, token?: string): Promise<VercelDeployment> {
    this.recordCall({
      method: 'GET',
      url: `/v13/deployments/${deploymentId}`,
      headers: { Authorization: `Bearer ${maskToken(token)}` },
    });

    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Unauthorized' };
    }

    const failure = this.checkFailure(`/v13/deployments/${deploymentId}`);
    if (failure) throw failure;

    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    // Find deployment across all projects
    for (const deployments of this.deployments.values()) {
      const deployment = deployments.find(d => d.uid === deploymentId);
      if (deployment) return deployment;
    }

    throw { status: 404, message: 'Deployment not found' };
  }

  /**
   * Mock: GET /v2/teams
   */
  async listTeams(token?: string): Promise<{ teams: VercelTeam[] }> {
    this.recordCall({
      method: 'GET',
      url: '/v2/teams',
      headers: { Authorization: `Bearer ${maskToken(token)}` },
    });

    if (!this.validateToken(token)) {
      throw { status: 401, message: 'Unauthorized' };
    }

    const failure = this.checkFailure('/v2/teams');
    if (failure) throw failure;

    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    return { teams: Array.from(this.teams.values()) };
  }

  /**
   * Helper: Create a test project with deployment
   */
  createTestProject(projectId: string, projectName: string): void {
    const now = Date.now();
    this.addProject({
      id: projectId,
      name: projectName,
      accountId: 'mock-account-id',
      framework: 'nextjs',
      nodeVersion: '18.x',
      createdAt: now - 86400000, // 1 day ago
      updatedAt: now,
      latestDeployments: [
        {
          uid: `${projectId}-deploy-1`,
          name: projectName,
          url: `${projectName}.vercel.app`,
          state: 'READY',
          readyState: 'READY',
          created: now,
          createdAt: now,
          ready: now,
          target: 'production',
          meta: {
            githubCommitSha: 'abc123',
            githubCommitMessage: 'Deploy to production',
            githubCommitRef: 'main',
          },
          inspectorUrl: `https://vercel.com/${projectName}/deployments/${projectId}-deploy-1`,
        },
      ],
    });
  }

  /**
   * Helper: Simulate a failed deployment
   */
  addFailedDeployment(projectId: string): void {
    const now = Date.now();
    this.addDeployment(projectId, {
      uid: `${projectId}-deploy-failed-${now}`,
      name: 'failed-deployment',
      url: '',
      state: 'ERROR',
      readyState: 'ERROR',
      created: now,
      createdAt: now,
      target: 'preview',
      meta: {
        githubCommitSha: 'def456',
        githubCommitMessage: 'Broken build',
        githubCommitRef: 'feature/broken',
      },
    });
  }

  /**
   * Reset the mock service
   */
  override reset(): void {
    super.reset();
    this.projects.clear();
    this.deployments.clear();
    this.teams.clear();
    this.validTokens.clear();
    this.failureScenarios.clear();
  }
}

// Export singleton instance
export const vercelMock = new VercelMockService();
