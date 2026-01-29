/**
 * Claude AI Mock Service
 *
 * Mocks Anthropic Claude API for testing without actual API calls.
 * Supports content generation, routing decisions, and streaming.
 */

import { BaseMockService, MockServiceConfig, maskToken } from './types.js';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  tools?: ClaudeTool[];
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeMockConfig extends MockServiceConfig {
  /** Default model to use */
  defaultModel?: string;
  /** Default response delay in ms */
  responseDelay?: number;
}

type ResponseGenerator = (request: ClaudeRequest) => string | ClaudeContentBlock[];

/**
 * Claude AI Mock Service
 */
export class ClaudeMockService extends BaseMockService {
  name = 'ClaudeAPI';

  private defaultModel: string;
  private responseDelay: number;
  private validApiKeys: Set<string> = new Set();
  private customResponses: Map<string, ResponseGenerator> = new Map();
  private defaultResponse: ResponseGenerator = () => 'This is a mock response from Claude AI.';
  private failureScenarios: Map<string, { status: number; message: string }> = new Map();
  private messageCounter = 0;

  constructor(config: ClaudeMockConfig = {}) {
    super(config);
    this.defaultModel = config.defaultModel || 'claude-3-opus-20240229';
    this.responseDelay = config.responseDelay || 0;
  }

  /**
   * Register a valid API key
   */
  addValidApiKey(key: string): void {
    this.validApiKeys.add(key);
  }

  /**
   * Set a custom response for requests matching a pattern
   */
  setResponse(pattern: string, generator: ResponseGenerator): void {
    this.customResponses.set(pattern, generator);
  }

  /**
   * Set the default response generator
   */
  setDefaultResponse(generator: ResponseGenerator): void {
    this.defaultResponse = generator;
  }

  /**
   * Set a failure scenario for requests matching a pattern
   */
  setFailure(pattern: string, status: number, message: string): void {
    this.failureScenarios.set(pattern, { status, message });
  }

  /**
   * Clear a failure scenario
   */
  clearFailure(pattern: string): void {
    this.failureScenarios.delete(pattern);
  }

  /**
   * Validate API key
   */
  private validateApiKey(key?: string): boolean {
    if (this.validApiKeys.size === 0) return true;
    if (!key) return false;
    return this.validApiKeys.has(key);
  }

  /**
   * Find matching response generator
   */
  private findResponseGenerator(request: ClaudeRequest): ResponseGenerator {
    const systemPrompt = request.system || '';
    const userMessage = this.extractUserMessage(request);
    const combined = `${systemPrompt} ${userMessage}`.toLowerCase();

    for (const [pattern, generator] of this.customResponses) {
      if (combined.includes(pattern.toLowerCase())) {
        return generator;
      }
    }

    return this.defaultResponse;
  }

  /**
   * Extract user message from request
   */
  private extractUserMessage(request: ClaudeRequest): string {
    const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return '';

    if (typeof lastUserMessage.content === 'string') {
      return lastUserMessage.content;
    }

    return lastUserMessage.content
      .filter((block): block is ClaudeContentBlock & { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join(' ');
  }

  /**
   * Check for failure scenarios
   */
  private checkFailure(request: ClaudeRequest): { status: number; message: string } | null {
    const systemPrompt = request.system || '';
    const userMessage = this.extractUserMessage(request);
    const combined = `${systemPrompt} ${userMessage}`.toLowerCase();

    for (const [pattern, failure] of this.failureScenarios) {
      if (combined.includes(pattern.toLowerCase())) {
        return failure;
      }
    }

    return null;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    this.messageCounter++;
    return `msg_mock_${Date.now()}_${this.messageCounter}`;
  }

  /**
   * Calculate mock token usage
   */
  private calculateUsage(request: ClaudeRequest, response: string | ClaudeContentBlock[]): { input_tokens: number; output_tokens: number } {
    const inputText = JSON.stringify(request.messages) + (request.system || '');
    const outputText = typeof response === 'string' ? response : JSON.stringify(response);

    // Rough token estimation (4 chars per token)
    return {
      input_tokens: Math.ceil(inputText.length / 4),
      output_tokens: Math.ceil(outputText.length / 4),
    };
  }

  /**
   * Mock: POST /v1/messages
   */
  async createMessage(request: ClaudeRequest, apiKey?: string): Promise<ClaudeResponse> {
    this.recordCall({
      method: 'POST',
      url: '/v1/messages',
      headers: { 'x-api-key': maskToken(apiKey) },
      body: { model: request.model, max_tokens: request.max_tokens },
    });

    // Validate API key
    if (!this.validateApiKey(apiKey)) {
      throw { status: 401, message: 'Invalid API key' };
    }

    // Check for failure scenarios
    const failure = this.checkFailure(request);
    if (failure) {
      throw failure;
    }

    // Simulate response delay
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    // Generate response
    const generator = this.findResponseGenerator(request);
    const responseContent = generator(request);

    const content: ClaudeContentBlock[] = typeof responseContent === 'string'
      ? [{ type: 'text', text: responseContent }]
      : responseContent;

    const usage = this.calculateUsage(request, responseContent);

    // Check if response includes tool use
    const hasToolUse = content.some(block => block.type === 'tool_use');

    return {
      id: this.generateMessageId(),
      type: 'message',
      role: 'assistant',
      content,
      model: request.model || this.defaultModel,
      stop_reason: hasToolUse ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage,
    };
  }

  /**
   * Helper: Set up content generation response
   */
  setupContentGeneration(responseMarkdown: string): void {
    this.setResponse('generate', () => responseMarkdown);
  }

  /**
   * Helper: Set up routing decision response
   */
  setupRoutingDecision(decision: {
    action: 'create' | 'update' | 'merge' | 'skip';
    confidence: number;
    reason: string;
    targetPageId?: string;
  }): void {
    this.setResponse('route', () => JSON.stringify(decision));
  }

  /**
   * Helper: Set up content merge response
   */
  setupContentMerge(mergedContent: string): void {
    this.setResponse('merge', () => mergedContent);
  }

  /**
   * Helper: Simulate rate limiting
   */
  simulateRateLimit(): void {
    this.setFailure('', 429, 'Rate limit exceeded. Please retry after some time.');
  }

  /**
   * Helper: Simulate overloaded error
   */
  simulateOverloaded(): void {
    this.setFailure('', 529, 'API is temporarily overloaded. Please try again later.');
  }

  /**
   * Reset the mock service
   */
  override reset(): void {
    super.reset();
    this.validApiKeys.clear();
    this.customResponses.clear();
    this.failureScenarios.clear();
    this.defaultResponse = () => 'This is a mock response from Claude AI.';
    this.messageCounter = 0;
  }
}

// Export singleton instance
export const claudeMock = new ClaudeMockService();
