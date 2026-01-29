/**
 * Railway GraphQL Mock Service
 *
 * Mocks Railway's GraphQL API for testing deployment and service monitoring.
 */

import { BaseMockService, MockServiceConfig, maskToken } from './types.js';

export interface RailwayDeployment {
  id: string;
  status: 'BUILDING' | 'DEPLOYING' | 'SUCCESS' | 'FAILED' | 'CRASHED' | 'REMOVED';
  createdAt: string;
  staticUrl?: string;
  meta?: {
    commitHash?: string;
    commitMessage?: string;
    branch?: string;
  };
}

export interface RailwayService {
  id: string;
  name: string;
  projectId: string;
  deployments: RailwayDeployment[];
  recentDeployments?: RailwayDeployment[];
}

export interface RailwayProject {
  id: string;
  name: string;
  description?: string;
  services: RailwayService[];
  environments: Array<{ id: string; name: string }>;
}

export interface RailwayMockConfig extends MockServiceConfig {
  /** Simulate response delay in ms */
  responseDelay?: number;
}

interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

interface GraphQLResponse {
  data?: unknown;
  errors?: Array<{ message: string; path?: string[] }>;
}

/**
 * Railway GraphQL Mock Service
 */
export class RailwayMockService extends BaseMockService {
  name = 'RailwayGraphQL';

  private projects: Map<string, RailwayProject> = new Map();
  private validTokens: Set<string> = new Set();
  private responseDelay: number;
  private failureScenarios: Map<string, { message: string }> = new Map();

  constructor(config: RailwayMockConfig = {}) {
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
  addProject(project: RailwayProject): void {
    this.projects.set(project.id, project);
  }

  /**
   * Add a deployment to a service
   */
  addDeployment(projectId: string, serviceId: string, deployment: RailwayDeployment): void {
    const project = this.projects.get(projectId);
    if (!project) return;

    const service = project.services.find(s => s.id === serviceId);
    if (!service) return;

    service.deployments.unshift(deployment);
    service.recentDeployments = service.deployments.slice(0, 5);
  }

  /**
   * Set a failure scenario for a query type
   */
  setFailure(queryType: string, message: string): void {
    this.failureScenarios.set(queryType, { message });
  }

  /**
   * Clear a failure scenario
   */
  clearFailure(queryType: string): void {
    this.failureScenarios.delete(queryType);
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
   * Detect query type from GraphQL query
   */
  private detectQueryType(query: string): string {
    if (query.includes('project(')) return 'project';
    if (query.includes('deployments')) return 'deployments';
    if (query.includes('services')) return 'services';
    if (query.includes('me')) return 'me';
    return 'unknown';
  }

  /**
   * Mock: POST /graphql
   */
  async query(request: GraphQLRequest, token?: string): Promise<GraphQLResponse> {
    this.recordCall({
      method: 'POST',
      url: '/graphql',
      headers: { Authorization: `Bearer ${maskToken(token)}` },
      body: { operationName: request.operationName },
    });

    // Validate token
    if (!this.validateToken(token)) {
      return {
        errors: [{ message: 'Unauthorized: Invalid or missing token' }],
      };
    }

    // Simulate response delay
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    const queryType = this.detectQueryType(request.query);

    // Check failure scenarios
    const failure = this.failureScenarios.get(queryType);
    if (failure) {
      return {
        errors: [{ message: failure.message }],
      };
    }

    // Handle different query types
    switch (queryType) {
      case 'project':
        return this.handleProjectQuery(request);
      case 'deployments':
        return this.handleDeploymentsQuery(request);
      case 'services':
        return this.handleServicesQuery(request);
      case 'me':
        return this.handleMeQuery();
      default:
        return {
          errors: [{ message: 'Unknown query type' }],
        };
    }
  }

  /**
   * Handle project query
   */
  private handleProjectQuery(request: GraphQLRequest): GraphQLResponse {
    const projectId = request.variables?.projectId as string;
    if (!projectId) {
      return { errors: [{ message: 'Project ID required' }] };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { errors: [{ message: 'Project not found' }] };
    }

    return {
      data: {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          services: {
            edges: project.services.map(s => ({
              node: {
                id: s.id,
                name: s.name,
                recentDeployments: s.recentDeployments || s.deployments.slice(0, 5),
              },
            })),
          },
          environments: {
            edges: project.environments.map(e => ({ node: e })),
          },
        },
      },
    };
  }

  /**
   * Handle deployments query
   */
  private handleDeploymentsQuery(request: GraphQLRequest): GraphQLResponse {
    const projectId = request.variables?.projectId as string;
    const serviceId = request.variables?.serviceId as string;

    if (!projectId) {
      return { errors: [{ message: 'Project ID required' }] };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { errors: [{ message: 'Project not found' }] };
    }

    let deployments: RailwayDeployment[] = [];
    if (serviceId) {
      const service = project.services.find(s => s.id === serviceId);
      deployments = service?.deployments || [];
    } else {
      deployments = project.services.flatMap(s => s.deployments);
    }

    return {
      data: {
        deployments: {
          edges: deployments.map(d => ({
            node: {
              id: d.id,
              status: d.status,
              createdAt: d.createdAt,
              staticUrl: d.staticUrl,
              meta: d.meta,
            },
          })),
        },
      },
    };
  }

  /**
   * Handle services query
   */
  private handleServicesQuery(request: GraphQLRequest): GraphQLResponse {
    const projectId = request.variables?.projectId as string;

    if (!projectId) {
      return { errors: [{ message: 'Project ID required' }] };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { errors: [{ message: 'Project not found' }] };
    }

    return {
      data: {
        services: {
          edges: project.services.map(s => ({
            node: {
              id: s.id,
              name: s.name,
              projectId: s.projectId,
            },
          })),
        },
      },
    };
  }

  /**
   * Handle me query (current user)
   */
  private handleMeQuery(): GraphQLResponse {
    return {
      data: {
        me: {
          id: 'mock-user-id',
          email: 'mock@test.com',
          name: 'Mock User',
        },
      },
    };
  }

  /**
   * Helper: Create a test project with service and deployment
   */
  createTestProject(projectId: string, projectName: string): void {
    const serviceId = `${projectId}-service`;
    this.addProject({
      id: projectId,
      name: projectName,
      services: [
        {
          id: serviceId,
          name: `${projectName}-api`,
          projectId,
          deployments: [
            {
              id: `${serviceId}-deploy-1`,
              status: 'SUCCESS',
              createdAt: new Date().toISOString(),
              staticUrl: `https://${projectName}.up.railway.app`,
              meta: {
                commitHash: 'abc123',
                commitMessage: 'Initial deployment',
                branch: 'main',
              },
            },
          ],
        },
      ],
      environments: [
        { id: `${projectId}-prod`, name: 'production' },
        { id: `${projectId}-dev`, name: 'development' },
      ],
    });
  }

  /**
   * Reset the mock service
   */
  override reset(): void {
    super.reset();
    this.projects.clear();
    this.validTokens.clear();
    this.failureScenarios.clear();
  }
}

// Export singleton instance
export const railwayMock = new RailwayMockService();
