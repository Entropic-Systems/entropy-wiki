import { pipeline } from '@xenova/transformers';

// Model configuration
export const LOCAL_EMBEDDING_DIMENSIONS = 384;

// Lazy-load the model (downloads on first use, ~90MB)
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

/**
 * Generate an embedding vector for the given text using local model
 * Uses Xenova/all-MiniLM-L6-v2 (384 dimensions)
 * First call downloads the model (~90MB), subsequent calls use cached model
 */
export async function generateLocalEmbedding(text: string): Promise<number[]> {
  const embed = await getEmbedder();
  const output = await embed(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
