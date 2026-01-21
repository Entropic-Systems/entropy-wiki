import { describe, it, expect } from 'vitest';
import {
  generateLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSIONS,
} from '../src/services/local-embeddings.js';

describe('Local Embeddings Service', () => {
  describe('LOCAL_EMBEDDING_DIMENSIONS', () => {
    it('should export constant equal to 384', () => {
      expect(LOCAL_EMBEDDING_DIMENSIONS).toBe(384);
    });
  });

  describe('generateLocalEmbedding', () => {
    it('should be a function', () => {
      expect(typeof generateLocalEmbedding).toBe('function');
    });

    it('should return an array of numbers', async () => {
      const result = await generateLocalEmbedding('test text');
      expect(Array.isArray(result)).toBe(true);
      expect(result.every((n) => typeof n === 'number')).toBe(true);
    });

    it('should return embedding with 384 dimensions', async () => {
      const result = await generateLocalEmbedding('Hello world');
      expect(result.length).toBe(384);
    });

    it('should return normalized embedding (unit length)', async () => {
      const result = await generateLocalEmbedding('Test sentence for normalization');
      // Calculate L2 norm
      const norm = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      // Should be approximately 1.0 (normalized)
      expect(norm).toBeCloseTo(1.0, 3);
    });

    it('should produce different embeddings for different texts', async () => {
      const embedding1 = await generateLocalEmbedding('Cats are great pets');
      const embedding2 = await generateLocalEmbedding('Quantum physics is complex');

      // Calculate cosine similarity
      const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
      // Different topics should have low similarity (not close to 1)
      expect(dotProduct).toBeLessThan(0.9);
    });

    it('should produce similar embeddings for similar texts', async () => {
      const embedding1 = await generateLocalEmbedding('I love programming in TypeScript');
      const embedding2 = await generateLocalEmbedding('TypeScript programming is great');

      // Calculate cosine similarity
      const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
      // Similar topics should have higher similarity
      expect(dotProduct).toBeGreaterThan(0.5);
    });
  });
});
