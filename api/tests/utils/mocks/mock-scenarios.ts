/**
 * Mock Scenarios
 *
 * Pre-configured scenarios for common testing situations.
 * Use these to quickly set up realistic test environments.
 */

import { githubMock } from './github-mock.js';
import { claudeMock } from './claude-mock.js';
import { twitterMock } from './twitter-mock.js';
import { railwayMock } from './railway-mock.js';
import { vercelMock } from './vercel-mock.js';

export interface ScenarioConfig {
  name: string;
  description: string;
  setup: () => void;
  teardown?: () => void;
}

/**
 * Built-in scenarios for common testing situations
 */
export const scenarios = {
  /**
   * Happy path scenario - all services work normally
   */
  happyPath: {
    name: 'happy-path',
    description: 'All services respond successfully with realistic data',
    setup: () => {
      // GitHub: Add popular repository
      githubMock.addRepo('anthropics', 'claude-code', {
        description: 'Claude Code CLI tool',
        stargazers_count: 5000,
        forks_count: 500,
        language: 'TypeScript',
        topics: ['ai', 'cli', 'developer-tools'],
        readme: '# Claude Code\n\nAI-powered coding assistant CLI.\n\n## Installation\n\n```bash\nnpm install -g @anthropic/claude-code\n```',
        files: {
          'package.json': '{"name": "@anthropic/claude-code", "version": "1.0.0"}',
          'src/index.ts': 'export const version = "1.0.0";',
        },
      });

      // Claude: Set up content generation
      claudeMock.setDefaultResponse(() =>
        '# Generated Content\n\nThis is AI-generated content for testing purposes.\n\n## Key Points\n\n- Point 1\n- Point 2\n- Point 3'
      );

      // Twitter: Add sample tweets
      twitterMock.addTweet({
        id: '1234567890',
        author: 'anthropic',
        authorDisplayName: 'Anthropic',
        content: 'Introducing Claude Code - AI-powered coding assistant! #AI #DevTools',
        timestamp: new Date().toISOString(),
        likes: 1500,
        retweets: 300,
      });

      // Railway: Add test project
      railwayMock.createTestProject('test-project', 'entropy-wiki');

      // Vercel: Add test project
      vercelMock.createTestProject('test-project', 'entropy-wiki');
    },
    teardown: () => {
      githubMock.reset();
      claudeMock.reset();
      twitterMock.reset();
      railwayMock.reset();
      vercelMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Rate limiting scenario - GitHub API is rate limited
   */
  githubRateLimited: {
    name: 'github-rate-limited',
    description: 'GitHub API returns rate limit errors',
    setup: () => {
      githubMock.setRateLimit(0);
    },
    teardown: () => {
      githubMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Auth failure scenario - Invalid credentials
   */
  authFailure: {
    name: 'auth-failure',
    description: 'All services reject authentication',
    setup: () => {
      githubMock.addValidToken('valid-token-only');
      claudeMock.addValidApiKey('valid-key-only');
      railwayMock.addValidToken('valid-token-only');
      vercelMock.addValidToken('valid-token-only');
    },
    teardown: () => {
      githubMock.reset();
      claudeMock.reset();
      railwayMock.reset();
      vercelMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Network errors scenario - Simulate various network issues
   */
  networkErrors: {
    name: 'network-errors',
    description: 'Services return various network errors',
    setup: () => {
      githubMock.setFailure('anthropics', 'claude-code', 503, 'Service Unavailable');
      claudeMock.setFailure('', 500, 'Internal Server Error');
      railwayMock.setFailure('project', 'Gateway Timeout');
      vercelMock.setFailure('/v9/projects', 502, 'Bad Gateway');
    },
    teardown: () => {
      githubMock.reset();
      claudeMock.reset();
      railwayMock.reset();
      vercelMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Partial failure scenario - Some services fail, others succeed
   */
  partialFailure: {
    name: 'partial-failure',
    description: 'GitHub works, Claude fails, deployment services work',
    setup: () => {
      // GitHub works
      githubMock.addRepo('test', 'repo', {
        description: 'Test repository',
        readme: '# Test\n\nTest content.',
      });

      // Claude fails
      claudeMock.simulateOverloaded();

      // Railway works
      railwayMock.createTestProject('test-project', 'test-app');

      // Vercel works
      vercelMock.createTestProject('test-project', 'test-app');
    },
    teardown: () => {
      githubMock.reset();
      claudeMock.reset();
      railwayMock.reset();
      vercelMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Empty responses scenario - Services return empty/no data
   */
  emptyResponses: {
    name: 'empty-responses',
    description: 'Services return valid but empty responses',
    setup: () => {
      // GitHub: Repo exists but no README
      githubMock.addRepo('test', 'empty-repo', {
        description: null,
      });

      // Claude: Returns minimal content
      claudeMock.setDefaultResponse(() => '');

      // Twitter: Empty, no tweets registered

      // Railway: Empty project
      railwayMock.addProject({
        id: 'empty-project',
        name: 'Empty Project',
        services: [],
        environments: [],
      });

      // Vercel: Empty project
      vercelMock.addProject({
        id: 'empty-project',
        name: 'empty-project',
        accountId: 'account',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        latestDeployments: [],
      });
    },
    teardown: () => {
      githubMock.reset();
      claudeMock.reset();
      twitterMock.reset();
      railwayMock.reset();
      vercelMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Content extraction scenario - Rich content for extraction testing
   */
  contentExtraction: {
    name: 'content-extraction',
    description: 'Rich content for testing content extraction pipeline',
    setup: () => {
      // GitHub: Multiple repos with various content
      githubMock.addRepo('owner1', 'repo1', {
        description: 'A TypeScript utility library',
        language: 'TypeScript',
        stargazers_count: 100,
        readme: `# Repo 1

A utility library for TypeScript developers.

## Features

- Feature 1: Does something useful
- Feature 2: Does something else useful
- Feature 3: The most useful feature

## Installation

\`\`\`bash
npm install repo1
\`\`\`

## Usage

\`\`\`typescript
import { useful } from 'repo1';

useful();
\`\`\`
`,
        files: {
          'src/index.ts': 'export const useful = () => console.log("useful!");',
        },
      });

      // Twitter: Multiple tweets
      twitterMock.addTweet({
        id: '111',
        author: 'developer1',
        authorDisplayName: 'Developer One',
        content: 'Just released v2.0 of my library! Check it out. #opensource',
        timestamp: '2024-01-15T10:00:00Z',
      });

      twitterMock.addTweet({
        id: '222',
        author: 'developer2',
        authorDisplayName: 'Developer Two',
        content: 'Great thread on TypeScript best practices 🧵',
        timestamp: '2024-01-16T14:30:00Z',
      });

      // Claude: Content generation responses
      claudeMock.setResponse('summarize', (req) => {
        const content = JSON.stringify(req.messages);
        return `## Summary\n\nThis is a summary of the provided content.\n\n### Key Points\n\n- The content discusses important topics\n- Multiple perspectives are presented\n- Actionable insights are provided`;
      });

      claudeMock.setResponse('generate', () =>
        `# Generated Article

This article explores key concepts in software development.

## Introduction

Software development is a complex field requiring both technical skills and creative problem-solving.

## Main Content

The main content goes here with detailed explanations.

## Conclusion

In conclusion, continuous learning is essential for developers.`
      );
    },
    teardown: () => {
      githubMock.reset();
      claudeMock.reset();
      twitterMock.reset();
    },
  } as ScenarioConfig,

  /**
   * Deployment monitoring scenario - Various deployment states
   */
  deploymentMonitoring: {
    name: 'deployment-monitoring',
    description: 'Various deployment states for monitoring testing',
    setup: () => {
      const now = Date.now();

      // Railway: Multiple deployments in different states
      railwayMock.addProject({
        id: 'monitor-project',
        name: 'monitored-app',
        services: [
          {
            id: 'api-service',
            name: 'api',
            projectId: 'monitor-project',
            deployments: [
              {
                id: 'deploy-success',
                status: 'SUCCESS',
                createdAt: new Date(now - 3600000).toISOString(),
                staticUrl: 'https://api.monitored-app.railway.app',
                meta: { commitHash: 'abc123', commitMessage: 'Deploy v1.0', branch: 'main' },
              },
              {
                id: 'deploy-failed',
                status: 'FAILED',
                createdAt: new Date(now - 7200000).toISOString(),
                meta: { commitHash: 'def456', commitMessage: 'Broken build', branch: 'feature' },
              },
            ],
          },
        ],
        environments: [{ id: 'prod', name: 'production' }],
      });

      // Vercel: Multiple deployments
      vercelMock.addProject({
        id: 'monitor-project',
        name: 'monitored-frontend',
        accountId: 'account',
        framework: 'nextjs',
        createdAt: now - 86400000,
        updatedAt: now,
        latestDeployments: [
          {
            uid: 'vercel-deploy-1',
            name: 'monitored-frontend',
            url: 'monitored-frontend.vercel.app',
            state: 'READY',
            readyState: 'READY',
            created: now - 3600000,
            createdAt: now - 3600000,
            ready: now - 3500000,
            target: 'production',
          },
          {
            uid: 'vercel-deploy-2',
            name: 'monitored-frontend',
            url: 'monitored-frontend-preview.vercel.app',
            state: 'BUILDING',
            created: now,
            createdAt: now,
            buildingAt: now,
            target: 'preview',
          },
        ],
      });
    },
    teardown: () => {
      railwayMock.reset();
      vercelMock.reset();
    },
  } as ScenarioConfig,
};

/**
 * Apply a scenario by name
 */
export function applyScenario(name: keyof typeof scenarios): void {
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }
  scenario.setup();
}

/**
 * Tear down a scenario by name
 */
export function teardownScenario(name: keyof typeof scenarios): void {
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }
  scenario.teardown?.();
}

/**
 * Reset all mock services
 */
export function resetAllMocks(): void {
  githubMock.reset();
  claudeMock.reset();
  twitterMock.reset();
  railwayMock.reset();
  vercelMock.reset();
}
