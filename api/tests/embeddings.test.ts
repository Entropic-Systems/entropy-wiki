import { describe, it, expect, vi } from 'vitest';

// Test the embeddings module that should use local embeddings
describe('Embeddings Service (Local Model)', () => {
  describe('EMBEDDING_DIMENSIONS export', () => {
    it('should export EMBEDDING_DIMENSIONS as 384 (local model dimension)', async () => {
      const { EMBEDDING_DIMENSIONS } = await import('../src/services/embeddings.js');
      expect(EMBEDDING_DIMENSIONS).toBe(384);
    });
  });

  describe('generateEmbedding function', () => {
    it('should be a function', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');
      expect(typeof generateEmbedding).toBe('function');
    });

    it('should return an array of 384 numbers', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');
      const result = await generateEmbedding('test text');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(384);
      expect(result.every((n: number) => typeof n === 'number')).toBe(true);
    });

    it('should return normalized embedding (unit length)', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');
      const result = await generateEmbedding('Test sentence for normalization');

      // Calculate L2 norm
      const norm = Math.sqrt(result.reduce((sum: number, val: number) => sum + val * val, 0));
      // Should be approximately 1.0 (normalized)
      expect(norm).toBeCloseTo(1.0, 3);
    });

    it('should handle long text by truncating', async () => {
      const { generateEmbedding } = await import('../src/services/embeddings.js');

      // Create text longer than MAX_CHUNK_CHARS (30000)
      const longText = 'x'.repeat(35000);

      // Should not throw, should truncate and process
      const result = await generateEmbedding(longText);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(384);
    });
  });

  describe('No OpenAI dependency', () => {
    it('should not import OpenAI SDK', async () => {
      // Read the actual source file to verify no OpenAI imports
      const fs = await import('fs');
      const path = await import('path');
      const fileURLToPath = (await import('url')).fileURLToPath;

      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const embeddingsPath = path.resolve(currentDir, '../src/services/embeddings.ts');
      const content = fs.readFileSync(embeddingsPath, 'utf-8');

      // Should not have OpenAI import
      expect(content).not.toMatch(/import.*OpenAI.*from\s+['"]openai['"]/);
      expect(content).not.toMatch(/from\s+['"]openai['"]/);
    });

    it('should import from local-embeddings', async () => {
      // Read the actual source file to verify local-embeddings import
      const fs = await import('fs');
      const path = await import('path');
      const fileURLToPath = (await import('url')).fileURLToPath;

      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const embeddingsPath = path.resolve(currentDir, '../src/services/embeddings.ts');
      const content = fs.readFileSync(embeddingsPath, 'utf-8');

      // Should have local-embeddings import
      expect(content).toMatch(/from\s+['"]\.\/local-embeddings\.js['"]/);
    });
  });
});
