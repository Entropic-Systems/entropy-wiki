/**
 * Content Fingerprinting Service
 *
 * Implements multiple fingerprinting algorithms for content deduplication:
 * - SimHash for structural similarity
 * - N-gram signatures for partial matching
 * - URL canonicalization for source deduplication
 */

import { query } from '../db/client.js';
import crypto from 'crypto';

// Configuration
const SIMHASH_BITS = 64;
const NGRAM_SIZE = 3;
const NGRAM_SIGNATURE_SIZE = 100; // Number of min-hash values to keep

/**
 * Normalize text for consistent fingerprinting
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[^\w\s]/g, '')        // Remove punctuation
    .trim();
}

/**
 * Normalize a title for comparison
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonicalize a URL for deduplication
 * Removes tracking parameters, normalizes protocol, etc.
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Normalize to https
    parsed.protocol = 'https:';

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'source', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'
    ];
    trackingParams.forEach(param => parsed.searchParams.delete(param));

    // Remove trailing slashes
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');

    // Sort query parameters for consistency
    parsed.searchParams.sort();

    // Remove hash/fragment
    parsed.hash = '';

    return parsed.toString();
  } catch {
    // Return original if URL parsing fails
    return url;
  }
}

/**
 * Generate n-grams from text
 */
export function generateNgrams(text: string, n: number = NGRAM_SIZE): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(w => w.length > 0);
  const ngrams: string[] = [];

  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }

  return ngrams;
}

/**
 * Hash a string to a 64-bit integer (as two 32-bit parts)
 */
function hashString(str: string): [number, number] {
  const hash = crypto.createHash('md5').update(str).digest();
  const high = hash.readUInt32BE(0);
  const low = hash.readUInt32BE(4);
  return [high, low];
}

/**
 * Generate SimHash fingerprint for content
 * SimHash produces similar hashes for similar content
 */
export function generateSimHash(text: string): Buffer {
  const ngrams = generateNgrams(text);

  if (ngrams.length === 0) {
    return Buffer.alloc(8); // Return zero hash for empty content
  }

  // Initialize vector for bit counting
  const v = new Array(SIMHASH_BITS).fill(0);

  // For each n-gram, hash it and update the vector
  for (const ngram of ngrams) {
    const [high, low] = hashString(ngram);

    // Process high 32 bits
    for (let i = 0; i < 32; i++) {
      if ((high >> (31 - i)) & 1) {
        v[i]++;
      } else {
        v[i]--;
      }
    }

    // Process low 32 bits
    for (let i = 0; i < 32; i++) {
      if ((low >> (31 - i)) & 1) {
        v[32 + i]++;
      } else {
        v[32 + i]--;
      }
    }
  }

  // Convert vector to hash
  const result = Buffer.alloc(8);
  let high = 0;
  let low = 0;

  for (let i = 0; i < 32; i++) {
    if (v[i] > 0) high |= (1 << (31 - i));
  }
  for (let i = 0; i < 32; i++) {
    if (v[32 + i] > 0) low |= (1 << (31 - i));
  }

  result.writeUInt32BE(high, 0);
  result.writeUInt32BE(low, 4);

  return result;
}

/**
 * Calculate Hamming distance between two SimHash values
 * Returns number of differing bits (lower = more similar)
 */
export function simHashDistance(hash1: Buffer, hash2: Buffer): number {
  let distance = 0;

  for (let i = 0; i < 8; i++) {
    let xor = hash1[i] ^ hash2[i];
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Convert SimHash distance to similarity score (0-1)
 */
export function simHashSimilarity(hash1: Buffer, hash2: Buffer): number {
  const distance = simHashDistance(hash1, hash2);
  return 1 - (distance / SIMHASH_BITS);
}

/**
 * Generate MinHash signature for set similarity (Jaccard)
 */
export function generateMinHashSignature(text: string): Buffer {
  const ngrams = new Set(generateNgrams(text));
  const signature = new Array(NGRAM_SIGNATURE_SIZE).fill(Number.MAX_SAFE_INTEGER);

  // Use different hash functions (simulated with different seeds)
  for (const ngram of ngrams) {
    for (let i = 0; i < NGRAM_SIGNATURE_SIZE; i++) {
      const hash = crypto
        .createHash('md5')
        .update(`${i}:${ngram}`)
        .digest()
        .readUInt32BE(0);

      if (hash < signature[i]) {
        signature[i] = hash;
      }
    }
  }

  // Convert to buffer
  const buffer = Buffer.alloc(NGRAM_SIGNATURE_SIZE * 4);
  for (let i = 0; i < NGRAM_SIGNATURE_SIZE; i++) {
    buffer.writeUInt32BE(signature[i], i * 4);
  }

  return buffer;
}

/**
 * Estimate Jaccard similarity from MinHash signatures
 */
export function minHashSimilarity(sig1: Buffer, sig2: Buffer): number {
  let matches = 0;

  for (let i = 0; i < NGRAM_SIGNATURE_SIZE; i++) {
    const val1 = sig1.readUInt32BE(i * 4);
    const val2 = sig2.readUInt32BE(i * 4);
    if (val1 === val2) matches++;
  }

  return matches / NGRAM_SIGNATURE_SIZE;
}

/**
 * Generate a semantic hash combining multiple signals
 */
export function generateSemanticHash(content: string, title?: string): Buffer {
  const normalized = normalizeText(content);
  const normalizedTitle = title ? normalizeTitle(title) : '';

  // Combine content and title for hashing
  const combined = `${normalizedTitle}|||${normalized}`;

  return crypto.createHash('sha256').update(combined).digest();
}

/**
 * Content fingerprint result
 */
export interface ContentFingerprint {
  pageSlug: string;
  urlCanonical?: string;
  semanticHash: Buffer;
  ngramSignature: Buffer;
  titleNormalized?: string;
}

/**
 * Generate all fingerprints for a piece of content
 */
export function generateFingerprints(
  pageSlug: string,
  content: string,
  options?: {
    url?: string;
    title?: string;
  }
): ContentFingerprint {
  return {
    pageSlug,
    urlCanonical: options?.url ? canonicalizeUrl(options.url) : undefined,
    semanticHash: generateSemanticHash(content, options?.title),
    ngramSignature: generateMinHashSignature(content),
    titleNormalized: options?.title ? normalizeTitle(options.title) : undefined,
  };
}

/**
 * Store fingerprint in database
 */
export async function storeFingerprint(fingerprint: ContentFingerprint): Promise<void> {
  await query(`
    INSERT INTO content_fingerprints (
      page_slug, url_canonical, semantic_hash, ngram_signature, title_normalized
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (page_slug) DO UPDATE SET
      url_canonical = EXCLUDED.url_canonical,
      semantic_hash = EXCLUDED.semantic_hash,
      ngram_signature = EXCLUDED.ngram_signature,
      title_normalized = EXCLUDED.title_normalized,
      updated_at = NOW()
  `, [
    fingerprint.pageSlug,
    fingerprint.urlCanonical,
    fingerprint.semanticHash,
    fingerprint.ngramSignature,
    fingerprint.titleNormalized,
  ]);
}

/**
 * Find fingerprints matching a URL
 */
export async function findByUrl(url: string): Promise<ContentFingerprint[]> {
  const canonical = canonicalizeUrl(url);

  const result = await query<{
    page_slug: string;
    url_canonical: string;
    semantic_hash: Buffer;
    ngram_signature: Buffer;
    title_normalized: string;
  }>(`
    SELECT page_slug, url_canonical, semantic_hash, ngram_signature, title_normalized
    FROM content_fingerprints
    WHERE url_canonical = $1
  `, [canonical]);

  return result.rows.map(row => ({
    pageSlug: row.page_slug,
    urlCanonical: row.url_canonical,
    semanticHash: row.semantic_hash,
    ngramSignature: row.ngram_signature,
    titleNormalized: row.title_normalized,
  }));
}

/**
 * Find fingerprints with similar titles
 */
export async function findByTitle(title: string): Promise<ContentFingerprint[]> {
  const normalized = normalizeTitle(title);

  const result = await query<{
    page_slug: string;
    url_canonical: string;
    semantic_hash: Buffer;
    ngram_signature: Buffer;
    title_normalized: string;
  }>(`
    SELECT page_slug, url_canonical, semantic_hash, ngram_signature, title_normalized
    FROM content_fingerprints
    WHERE title_normalized = $1
  `, [normalized]);

  return result.rows.map(row => ({
    pageSlug: row.page_slug,
    urlCanonical: row.url_canonical,
    semanticHash: row.semantic_hash,
    ngramSignature: row.ngram_signature,
    titleNormalized: row.title_normalized,
  }));
}

/**
 * Get fingerprint for a page
 */
export async function getFingerprint(pageSlug: string): Promise<ContentFingerprint | null> {
  const result = await query<{
    page_slug: string;
    url_canonical: string;
    semantic_hash: Buffer;
    ngram_signature: Buffer;
    title_normalized: string;
  }>(`
    SELECT page_slug, url_canonical, semantic_hash, ngram_signature, title_normalized
    FROM content_fingerprints
    WHERE page_slug = $1
  `, [pageSlug]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    pageSlug: row.page_slug,
    urlCanonical: row.url_canonical,
    semanticHash: row.semantic_hash,
    ngramSignature: row.ngram_signature,
    titleNormalized: row.title_normalized,
  };
}

/**
 * Delete fingerprint for a page
 */
export async function deleteFingerprint(pageSlug: string): Promise<boolean> {
  const result = await query(`
    DELETE FROM content_fingerprints WHERE page_slug = $1
  `, [pageSlug]);

  return (result.rowCount || 0) > 0;
}
