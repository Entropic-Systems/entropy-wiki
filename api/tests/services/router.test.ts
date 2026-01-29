/**
 * Router Service Tests
 *
 * Comprehensive tests for the AI routing and similarity search service.
 * Tests cover content matching, AI decisions, quick routing, and error handling.
 *
 * Strategy: Mock Claude AI, use actual routing logic, test edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findCandidatePages,
  makeRoutingDecision,
  quickRouteDecision,
  routeContent,
  type RoutingResult,
} from '../../src/services/router.js';
import type {
  ExtractedContent,
  SimilaritySearchResult,
  RoutingDecisionType,
} from '../../src/types.js';

// Mock the claude-headless module
vi.mock('../../src/services/claude-headless.js', () => ({
  callClaude: vi.fn(),
}));

// Mock the embeddings module
vi.mock('../../src/services/embeddings.js', () => ({
  findPagesForRouting: vi.fn(),
  findSimilarPages: vi.fn(),
}));

// Import mocked modules
import { callClaude } from '../../src/services/claude-headless.js';
import { findPagesForRouting, findSimilarPages } from '../../src/services/embeddings.js';

const mockCallClaude = vi.mocked(callClaude);
const mockFindPagesForRouting = vi.mocked(findPagesForRouting);
const mockFindSimilarPages = vi.mocked(findSimilarPages);

/**
 * Create sample extracted content for testing
 */
function createSampleContent(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    title: 'Sample Article Title',
    summary: 'This is a sample summary of the article content.',
    content: 'This is the full article content with detailed information about the topic.',
    topics: ['technology', 'testing'],
    entities: null,
    confidence: 0.8,
    ...overrides,
  };
}

/**
 * Create sample similar pages for testing
 */
function createSimilarPages(count: number = 3, startSimilarity: number = 0.7): SimilaritySearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    page_id: `page-${i + 1}-uuid`,
    page_title: `Similar Page ${i + 1}`,
    page_slug: `similar-page-${i + 1}`,
    chunk_text: `This is a preview of similar page ${i + 1} content.`,
    similarity: startSimilarity - (i * 0.1),
  }));
}

/**
 * Create a valid AI routing response
 */
function createAIRoutingResponse(overrides: Partial<{
  decision: RoutingDecisionType;
  target_page_id: string | null;
  target_section: string | null;
  reasoning: string;
  suggested_slug: string | null;
  suggested_title: string | null;
  confidence: number;
}> = {}): string {
  return JSON.stringify({
    decision: 'new_page',
    target_page_id: null,
    target_section: null,
    reasoning: 'Creating a new page for novel content',
    suggested_slug: 'sample-article-title',
    suggested_title: 'Sample Article Title',
    confidence: 0.85,
    ...overrides,
  });
}

describe('Router Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindPagesForRouting.mockResolvedValue([]);
    mockFindSimilarPages.mockResolvedValue([]);
    mockCallClaude.mockResolvedValue(createAIRoutingResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('quickRouteDecision', () => {
    describe('Content Validation', () => {
      it('should return skip decision when content is empty', () => {
        const content = createSampleContent({
          content: null,
          summary: null,
        });

        const result = quickRouteDecision(content, []);

        expect(result).not.toBeNull();
        expect(result!.decision).toBe('skip');
        expect(result!.reasoning).toContain('extraction failed');
        expect(result!.confidence).toBe(1.0);
      });

      it('should return skip decision when only summary is empty but content exists', () => {
        const content = createSampleContent({
          content: 'Some content',
          summary: null,
        });

        const result = quickRouteDecision(content, []);

        // Should NOT skip - we have content
        expect(result).toBeNull();
      });

      it('should return skip decision when only content is empty but summary exists', () => {
        const content = createSampleContent({
          content: null,
          summary: 'Some summary',
        });

        const result = quickRouteDecision(content, []);

        // Should NOT skip - we have summary
        expect(result).toBeNull();
      });
    });

    describe('Duplicate Detection', () => {
      it('should return skip for very high similarity (>95%)', () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(1, 0.96);

        const result = quickRouteDecision(content, similarPages);

        expect(result).not.toBeNull();
        expect(result!.decision).toBe('skip');
        expect(result!.reasoning).toContain('duplicate');
        expect(result!.target_page_id).toBe('page-1-uuid');
        expect(result!.confidence).toBe(0.9);
      });

      it('should not skip for high but not duplicate similarity (90%)', () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(1, 0.90);

        const result = quickRouteDecision(content, similarPages);

        // Should not make quick decision - needs AI
        expect(result).toBeNull();
      });

      it('should return null when no similar pages exist', () => {
        const content = createSampleContent();

        const result = quickRouteDecision(content, []);

        expect(result).toBeNull();
      });

      it('should return null for valid content with moderate similarity', () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(3, 0.7);

        const result = quickRouteDecision(content, similarPages);

        expect(result).toBeNull();
      });
    });

    describe('Edge Cases', () => {
      it('should include similar_pages in result', () => {
        const content = createSampleContent({
          content: null,
          summary: null,
        });
        const similarPages = createSimilarPages(2);

        const result = quickRouteDecision(content, similarPages);

        expect(result?.similar_pages).toEqual(similarPages);
      });

      it('should handle empty similar pages array', () => {
        const content = createSampleContent({
          content: null,
          summary: null,
        });

        const result = quickRouteDecision(content, []);

        expect(result?.similar_pages).toEqual([]);
      });
    });
  });

  describe('makeRoutingDecision', () => {
    describe('AI Integration', () => {
      it('should call Claude with routing prompt', async () => {
        const content = createSampleContent();

        await makeRoutingDecision(content);

        expect(mockCallClaude).toHaveBeenCalledWith(
          expect.stringContaining('routing system'),
          { extractJson: true }
        );
      });

      it('should include content title in prompt', async () => {
        const content = createSampleContent({ title: 'Test Title Here' });

        await makeRoutingDecision(content);

        expect(mockCallClaude).toHaveBeenCalledWith(
          expect.stringContaining('Test Title Here'),
          expect.anything()
        );
      });

      it('should include source URL in prompt when provided', async () => {
        const content = createSampleContent();

        await makeRoutingDecision(content, 'https://example.com/article');

        expect(mockCallClaude).toHaveBeenCalledWith(
          expect.stringContaining('https://example.com/article'),
          expect.anything()
        );
      });

      it('should include similar pages in prompt', async () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(2);
        mockFindPagesForRouting.mockResolvedValue(similarPages);

        await makeRoutingDecision(content);

        expect(mockCallClaude).toHaveBeenCalledWith(
          expect.stringContaining('Similar Page 1'),
          expect.anything()
        );
      });
    });

    describe('Response Parsing', () => {
      it('should parse valid JSON response', async () => {
        const content = createSampleContent();
        mockCallClaude.mockResolvedValue(createAIRoutingResponse({
          decision: 'new_page',
          confidence: 0.9,
        }));

        const result = await makeRoutingDecision(content);

        expect(result.decision).toBe('new_page');
        expect(result.confidence).toBe(0.9);
      });

      it('should handle JSON in markdown code blocks', async () => {
        const content = createSampleContent();
        const jsonContent = createAIRoutingResponse({ decision: 'update_page' });
        mockCallClaude.mockResolvedValue(`\`\`\`json\n${jsonContent}\n\`\`\``);

        const result = await makeRoutingDecision(content);

        expect(result.decision).toBe('update_page');
      });

      it('should normalize confidence to 0-1 range', async () => {
        const content = createSampleContent();
        mockCallClaude.mockResolvedValue(createAIRoutingResponse({
          confidence: 1.5, // Above range
        }));

        const result = await makeRoutingDecision(content);

        expect(result.confidence).toBeLessThanOrEqual(1);
      });

      it('should default confidence to 0.7 if not a number', async () => {
        const content = createSampleContent();
        mockCallClaude.mockResolvedValue(JSON.stringify({
          decision: 'new_page',
          confidence: 'high', // Invalid
        }));

        const result = await makeRoutingDecision(content);

        expect(result.confidence).toBe(0.7);
      });
    });

    describe('Fallback Behavior', () => {
      it('should use update_page fallback when AI fails and high similarity exists', async () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(1, 0.85);
        mockFindPagesForRouting.mockResolvedValue(similarPages);
        mockCallClaude.mockRejectedValue(new Error('AI service unavailable'));

        const result = await makeRoutingDecision(content);

        expect(result.decision).toBe('update_page');
        expect(result.target_page_id).toBe('page-1-uuid');
        expect(result.reasoning).toContain('AI unavailable');
        expect(result.confidence).toBe(0.6);
      });

      it('should use new_page fallback when AI fails and no high similarity', async () => {
        const content = createSampleContent({ title: 'Novel Content' });
        mockFindPagesForRouting.mockResolvedValue([]);
        mockCallClaude.mockRejectedValue(new Error('AI service unavailable'));

        const result = await makeRoutingDecision(content);

        expect(result.decision).toBe('new_page');
        expect(result.target_page_id).toBeNull();
        expect(result.suggested_slug).toBe('novel-content');
        expect(result.suggested_title).toBe('Novel Content');
        expect(result.confidence).toBe(0.4);
      });

      it('should use fallback when JSON parsing fails', async () => {
        const content = createSampleContent();
        mockCallClaude.mockResolvedValue('This is not valid JSON');

        const result = await makeRoutingDecision(content);

        expect(result.decision).toBe('new_page');
        expect(result.reasoning).toContain('Failed to parse');
        expect(result.confidence).toBe(0.3);
      });
    });

    describe('Decision Validation', () => {
      it('should validate decision types', async () => {
        const content = createSampleContent();
        mockCallClaude.mockResolvedValue(JSON.stringify({
          decision: 'invalid_decision',
          confidence: 0.9,
        }));

        const result = await makeRoutingDecision(content);

        // Should fall back to new_page for invalid decision
        expect(result.decision).toBe('new_page');
      });

      it('should accept all valid decision types', async () => {
        const validDecisions: RoutingDecisionType[] = [
          'new_page', 'update_page', 'append_section', 'merge', 'skip'
        ];

        for (const decision of validDecisions) {
          mockCallClaude.mockResolvedValue(createAIRoutingResponse({ decision }));
          const content = createSampleContent();

          const result = await makeRoutingDecision(content);

          expect(result.decision).toBe(decision);
        }
      });

      it('should use best matching page when target not specified', async () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(2);
        mockFindPagesForRouting.mockResolvedValue(similarPages);
        mockCallClaude.mockResolvedValue(JSON.stringify({
          decision: 'update_page',
          target_page_id: null, // Not specified
        }));

        const result = await makeRoutingDecision(content);

        expect(result.target_page_id).toBe('page-1-uuid'); // Best match
      });
    });
  });

  describe('findCandidatePages', () => {
    it('should call embeddings service with content', async () => {
      mockFindPagesForRouting.mockResolvedValue([]);

      await findCandidatePages('Test content', 5);

      expect(mockFindPagesForRouting).toHaveBeenCalledWith('Test content', 5);
    });

    it('should return similar pages from embeddings service', async () => {
      const pages = createSimilarPages(3);
      mockFindPagesForRouting.mockResolvedValue(pages);

      const result = await findCandidatePages('Test content');

      expect(result).toEqual(pages);
    });

    it('should use default limit of 5', async () => {
      mockFindPagesForRouting.mockResolvedValue([]);

      await findCandidatePages('Test content');

      expect(mockFindPagesForRouting).toHaveBeenCalledWith('Test content', 5);
    });
  });

  describe('routeContent', () => {
    describe('Full Pipeline', () => {
      it('should use quick routing for failed extraction', async () => {
        const content = createSampleContent({
          content: null,
          summary: null,
        });

        const result = await routeContent(content);

        expect(result.decision).toBe('skip');
        expect(mockCallClaude).not.toHaveBeenCalled();
      });

      it('should use quick routing for duplicates', async () => {
        const content = createSampleContent();
        const similarPages = createSimilarPages(1, 0.98);
        mockFindSimilarPages.mockResolvedValue(similarPages);

        const result = await routeContent(content);

        expect(result.decision).toBe('skip');
        expect(result.reasoning).toContain('duplicate');
        expect(mockCallClaude).not.toHaveBeenCalled();
      });

      it('should use AI routing for normal content', async () => {
        const content = createSampleContent();
        mockFindSimilarPages.mockResolvedValue([]);
        mockCallClaude.mockResolvedValue(createAIRoutingResponse());

        const result = await routeContent(content);

        expect(mockCallClaude).toHaveBeenCalled();
        expect(result.decision).toBe('new_page');
      });

      it('should pass source URL to AI routing', async () => {
        const content = createSampleContent();
        mockFindSimilarPages.mockResolvedValue([]);

        await routeContent(content, 'https://source.com');

        expect(mockCallClaude).toHaveBeenCalledWith(
          expect.stringContaining('https://source.com'),
          expect.anything()
        );
      });
    });

    describe('Error Handling', () => {
      it('should handle similarity search failure gracefully', async () => {
        const content = createSampleContent();
        mockFindSimilarPages.mockRejectedValue(new Error('Search failed'));
        mockCallClaude.mockResolvedValue(createAIRoutingResponse());

        const result = await routeContent(content);

        // Should still complete with AI routing
        expect(result.decision).toBe('new_page');
      });

      it('should handle AI failure with fallback', async () => {
        const content = createSampleContent();
        mockFindSimilarPages.mockResolvedValue([]);
        mockCallClaude.mockRejectedValue(new Error('AI unavailable'));

        const result = await routeContent(content);

        expect(result.decision).toBe('new_page');
        expect(result.reasoning).toContain('AI unavailable');
      });
    });

    describe('Similarity Threshold', () => {
      it('should use 0.2 similarity threshold', async () => {
        const content = createSampleContent();

        await routeContent(content);

        expect(mockFindSimilarPages).toHaveBeenCalledWith(
          expect.any(String),
          5,  // limit
          0.2 // threshold
        );
      });
    });
  });

  describe('Slug Generation', () => {
    it('should generate slug from title in fallback', async () => {
      const content = createSampleContent({ title: 'Test Title Here' });
      mockFindPagesForRouting.mockResolvedValue([]);
      mockCallClaude.mockRejectedValue(new Error('AI unavailable'));

      const result = await makeRoutingDecision(content);

      expect(result.suggested_slug).toBe('test-title-here');
    });

    it('should handle special characters in title', async () => {
      const content = createSampleContent({ title: 'Test!@#$%Title' });
      mockFindPagesForRouting.mockResolvedValue([]);
      mockCallClaude.mockRejectedValue(new Error('AI unavailable'));

      const result = await makeRoutingDecision(content);

      expect(result.suggested_slug).toBe('test-title');
    });

    it('should handle null title in fallback', async () => {
      const content = createSampleContent({ title: null });
      mockFindPagesForRouting.mockResolvedValue([]);
      mockCallClaude.mockRejectedValue(new Error('AI unavailable'));

      const result = await makeRoutingDecision(content);

      expect(result.suggested_slug).toBeNull();
    });
  });

  describe('Similar Pages Handling', () => {
    it('should include similar pages in all results', async () => {
      const content = createSampleContent();
      const similarPages = createSimilarPages(3);
      mockFindPagesForRouting.mockResolvedValue(similarPages);
      mockCallClaude.mockResolvedValue(createAIRoutingResponse());

      const result = await makeRoutingDecision(content);

      expect(result.similar_pages).toEqual(similarPages);
    });

    it('should show "No similar pages found" in prompt when empty', async () => {
      const content = createSampleContent();
      mockFindPagesForRouting.mockResolvedValue([]);

      await makeRoutingDecision(content);

      expect(mockCallClaude).toHaveBeenCalledWith(
        expect.stringContaining('No similar pages found'),
        expect.anything()
      );
    });

    it('should show similarity percentages in prompt', async () => {
      const content = createSampleContent();
      const similarPages = createSimilarPages(1, 0.75);
      mockFindPagesForRouting.mockResolvedValue(similarPages);

      await makeRoutingDecision(content);

      expect(mockCallClaude).toHaveBeenCalledWith(
        expect.stringContaining('75.0%'),
        expect.anything()
      );
    });
  });

  describe('Result Structure', () => {
    it('should return complete RoutingResult structure', async () => {
      const content = createSampleContent();
      mockCallClaude.mockResolvedValue(createAIRoutingResponse({
        decision: 'new_page',
        target_page_id: null,
        target_section: null,
        reasoning: 'Test reasoning',
        suggested_slug: 'test-slug',
        suggested_title: 'Test Title',
        confidence: 0.85,
      }));

      const result = await makeRoutingDecision(content);

      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('target_page_id');
      expect(result).toHaveProperty('target_section');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('suggested_slug');
      expect(result).toHaveProperty('suggested_title');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('similar_pages');
    });

    it('should preserve null values correctly', async () => {
      const content = createSampleContent();
      mockCallClaude.mockResolvedValue(createAIRoutingResponse({
        target_page_id: null,
        target_section: null,
        suggested_slug: null,
      }));

      const result = await makeRoutingDecision(content);

      expect(result.target_page_id).toBeNull();
      expect(result.target_section).toBeNull();
      expect(result.suggested_slug).toBeNull();
    });
  });
});
