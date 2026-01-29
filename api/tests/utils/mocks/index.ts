/**
 * Mock Services Index
 *
 * Central export for all mock services and utilities.
 *
 * @example
 * ```ts
 * import { mockManager, githubMock, scenarios } from '../utils/mocks/index.js';
 *
 * beforeEach(() => {
 *   mockManager.setupDefaults();
 * });
 *
 * afterEach(() => {
 *   mockManager.reset();
 * });
 *
 * it('should fetch from GitHub', async () => {
 *   githubMock.addRepo('owner', 'repo', { readme: '# Hello' });
 *   // ... test code
 *   mockManager.assertCalled('GitHubAPI', 'GET', '/repos/owner/repo');
 * });
 * ```
 */

// Types
export type {
  MockCall,
  MockResponse,
  MockScenario,
  MockServiceConfig,
  IMockService,
  RateLimitState,
} from './types.js';

export { BaseMockService, MockApiError, maskToken } from './types.js';

// Individual mock services
export {
  GitHubMockService,
  githubMock,
  type GitHubRepo,
  type GitHubContent,
  type GitHubRateLimit,
  type GitHubMockConfig,
} from './github-mock.js';

export {
  ClaudeMockService,
  claudeMock,
  type ClaudeMessage,
  type ClaudeContentBlock,
  type ClaudeRequest,
  type ClaudeTool,
  type ClaudeResponse,
  type ClaudeMockConfig,
} from './claude-mock.js';

export {
  TwitterMockService,
  twitterMock,
  type TwitterOEmbedResponse,
  type MockTweet,
  type TwitterMockConfig,
} from './twitter-mock.js';

export {
  RailwayMockService,
  railwayMock,
  type RailwayDeployment,
  type RailwayService,
  type RailwayProject,
  type RailwayMockConfig,
} from './railway-mock.js';

export {
  VercelMockService,
  vercelMock,
  type VercelDeployment,
  type VercelProject,
  type VercelTeam,
  type VercelMockConfig,
} from './vercel-mock.js';

// Scenarios
export {
  scenarios,
  applyScenario,
  teardownScenario,
  resetAllMocks,
  type ScenarioConfig,
} from './mock-scenarios.js';

// Mock Service Manager
export {
  MockServiceManager,
  mockManager,
  type MockManagerConfig,
  type CallValidation,
  type ValidationResult,
} from './mock-service-manager.js';
