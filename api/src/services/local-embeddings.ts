// Model configuration
export const LOCAL_EMBEDDING_DIMENSIONS = 384;

// Lazy-load the model (downloads on first use, ~90MB)
let embedder: any = null;
let loadError: Error | null = null;

async function getEmbedder() {
  if (loadError) {
    throw loadError;
  }
  if (!embedder) {
    try {
      // Dynamic import to avoid crash on platforms without ONNX support
      const { pipeline } = await import('@xenova/transformers');
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    } catch (err: any) {
      loadError = new Error(`Embeddings unavailable: ${err.message}`);
      throw loadError;
    }
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
