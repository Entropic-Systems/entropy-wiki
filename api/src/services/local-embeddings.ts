// Model configuration
export const LOCAL_EMBEDDING_DIMENSIONS = 384;

// Lazy-load the model (downloads on first use, ~90MB)
let embedder: any = null;
let loadError: Error | null = null;

async function getEmbedder() {
  if (loadError) {
    // Clear persistent errors after 5 minutes to allow retry
    const RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
    if (!loadError.message.includes('timestamp') ||
        Date.now() - parseInt(loadError.message.split('timestamp:')[1] || '0') > RETRY_INTERVAL) {
      loadError = null;
    } else {
      throw loadError;
    }
  }
  if (!embedder) {
    try {
      // Dynamic import to avoid crash on platforms without ONNX support
      const { pipeline } = await import('@xenova/transformers');
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    } catch (err: any) {
      // Include timestamp in error message for retry logic
      loadError = new Error(`Embeddings unavailable: ${err.message} timestamp:${Date.now()}`);
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

  // Add timeout to prevent hanging
  const EMBEDDING_TIMEOUT = 30000; // 30 seconds
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT);

  try {
    const output = await embed(text, { pooling: 'mean', normalize: true });
    clearTimeout(timeoutId);
    return Array.from(output.data);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Embedding generation timed out');
    }
    throw error;
  }
}
