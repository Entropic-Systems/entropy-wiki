/**
 * Domain Authority Analyzer
 *
 * Analyzes domain credibility based on multiple factors:
 * - Domain age and registration info
 * - SSL certificate status
 * - Known authoritative domain lists
 * - Platform-specific metrics
 */

import { URL } from 'url';

/**
 * Known authoritative domains by category
 */
const AUTHORITATIVE_DOMAINS: Record<string, { domains: string[]; score: number }> = {
  // Major tech companies - highest trust
  major_tech: {
    domains: [
      'github.com', 'openai.com', 'anthropic.com', 'google.com', 'microsoft.com',
      'meta.com', 'aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
      'huggingface.co', 'pytorch.org', 'tensorflow.org', 'nvidia.com',
    ],
    score: 0.95,
  },
  // Established tech news/docs
  tech_docs: {
    domains: [
      'docs.python.org', 'developer.mozilla.org', 'reactjs.org', 'nodejs.org',
      'typescriptlang.org', 'rust-lang.org', 'golang.org', 'kotlinlang.org',
      'docs.docker.com', 'kubernetes.io',
    ],
    score: 0.90,
  },
  // Quality tech publications
  tech_publications: {
    domains: [
      'arxiv.org', 'papers.nips.cc', 'paperswithcode.com', 'distill.pub',
      'blog.google', 'engineering.fb.com', 'netflixtechblog.com',
      'aws.amazon.com/blogs', 'research.google',
    ],
    score: 0.85,
  },
  // Community resources
  community: {
    domains: [
      'stackoverflow.com', 'dev.to', 'medium.com', 'hashnode.dev',
      'reddit.com', 'news.ycombinator.com', 'lobste.rs',
    ],
    score: 0.70,
  },
  // News outlets
  tech_news: {
    domains: [
      'techcrunch.com', 'theverge.com', 'arstechnica.com', 'wired.com',
      'venturebeat.com', 'zdnet.com', 'infoworld.com',
    ],
    score: 0.75,
  },
};

/**
 * Suspicious/low-quality domain patterns
 */
const LOW_QUALITY_PATTERNS: Array<{ pattern: RegExp; penalty: number }> = [
  { pattern: /\.(xyz|tk|ml|ga|cf|gq)$/i, penalty: 0.3 },  // Free TLDs often used for spam
  { pattern: /free|cheap|best.*2\d{3}/i, penalty: 0.2 },  // Spammy keywords
  { pattern: /\d{5,}/i, penalty: 0.15 },  // Lots of numbers in domain
  { pattern: /\.(info|biz|click|link)$/i, penalty: 0.1 },  // Less trusted TLDs
];

/**
 * Domain authority result
 */
export interface DomainAuthorityResult {
  domain: string;
  score: number;
  factors: {
    knownAuthority?: number;
    tlsStatus?: number;
    domainAge?: number;
    contentQuality?: number;
  };
  category?: string;
  warnings: string[];
}

/**
 * Extract root domain from URL
 * SECURITY: Validates URL before processing to prevent injection
 */
export function extractDomain(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL: must be a non-empty string');
  }

  // Basic URL format validation
  if (!/^https?:\/\/.+/i.test(url)) {
    throw new Error('Invalid URL: must start with http:// or https://');
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Additional security validation
    if (!hostname || hostname.length === 0) {
      throw new Error('Invalid URL: no hostname found');
    }

    // Prevent localhost and private IP access
    if (hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('192.168.')) {
      throw new Error('Invalid URL: local/private addresses not allowed');
    }

    return hostname.replace(/^www\./, '');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`URL parsing failed: ${error.message}`);
    }
    throw new Error('URL parsing failed: unknown error');
  }
}

/**
 * Check if domain is in authoritative list
 */
export function checkAuthoritativeList(domain: string): { score: number; category: string } | null {
  const normalizedDomain = domain.toLowerCase();

  for (const [category, { domains, score }] of Object.entries(AUTHORITATIVE_DOMAINS)) {
    for (const authDomain of domains) {
      if (normalizedDomain === authDomain || normalizedDomain.endsWith(`.${authDomain}`)) {
        return { score, category };
      }
    }
  }

  return null;
}

/**
 * Check for low-quality domain patterns
 */
export function checkLowQualityPatterns(domain: string): { penalty: number; reasons: string[] } {
  let totalPenalty = 0;
  const reasons: string[] = [];

  for (const { pattern, penalty } of LOW_QUALITY_PATTERNS) {
    if (pattern.test(domain)) {
      totalPenalty += penalty;
      reasons.push(`Matches suspicious pattern: ${pattern.source}`);
    }
  }

  return { penalty: Math.min(totalPenalty, 0.5), reasons };
}

/**
 * Analyze TLD quality
 */
export function analyzeTld(domain: string): number {
  const tld = domain.split('.').pop()?.toLowerCase() || '';

  const tldScores: Record<string, number> = {
    // Premium/established TLDs
    com: 0.85,
    org: 0.85,
    edu: 0.95,
    gov: 0.95,
    io: 0.80,
    co: 0.75,
    dev: 0.80,
    app: 0.80,
    // Country codes for major markets
    uk: 0.80,
    de: 0.80,
    fr: 0.80,
    jp: 0.80,
    // Lower trust TLDs
    net: 0.70,
    info: 0.60,
    biz: 0.50,
    // Very low trust
    xyz: 0.30,
    tk: 0.20,
    ml: 0.20,
    ga: 0.20,
    cf: 0.20,
    gq: 0.20,
  };

  return tldScores[tld] ?? 0.65; // Default for unknown TLDs
}

/**
 * Get domain age score (stub - would need external API)
 */
export function getDomainAgeScore(domain: string): number {
  // In production, this would call a WHOIS API
  // For now, use authoritative list as proxy

  const authResult = checkAuthoritativeList(domain);
  if (authResult) {
    // Known domains assumed to be established
    return 0.90;
  }

  // Default for unknown domains
  return 0.50;
}

/**
 * Analyze a domain's authority
 */
export function analyzeDomain(url: string): DomainAuthorityResult {
  const domain = extractDomain(url);
  const warnings: string[] = [];
  const factors: DomainAuthorityResult['factors'] = {};

  // 1. Check authoritative list
  const authResult = checkAuthoritativeList(domain);
  if (authResult) {
    factors.knownAuthority = authResult.score;
  }

  // 2. Analyze TLD
  const tldScore = analyzeTld(domain);
  factors.tlsStatus = tldScore;

  // 3. Check for low-quality patterns
  const lowQualityCheck = checkLowQualityPatterns(domain);
  if (lowQualityCheck.penalty > 0) {
    warnings.push(...lowQualityCheck.reasons);
  }

  // 4. Domain age (simplified)
  factors.domainAge = getDomainAgeScore(domain);

  // Calculate final score
  let score: number;

  if (factors.knownAuthority) {
    // If in authoritative list, use that as base
    score = factors.knownAuthority;
  } else {
    // Otherwise, combine factors
    score = (
      (factors.tlsStatus || 0.5) * 0.30 +
      (factors.domainAge || 0.5) * 0.30 +
      0.5 * 0.40  // Default content quality
    );
  }

  // Apply penalties
  score = Math.max(0.1, score - lowQualityCheck.penalty);

  return {
    domain,
    score,
    factors,
    category: authResult?.category,
    warnings,
  };
}

/**
 * Batch analyze multiple domains
 */
export function analyzeDomains(urls: string[]): DomainAuthorityResult[] {
  return urls.map(url => analyzeDomain(url));
}

/**
 * Check if a domain should be trusted for auto-ingestion
 */
export function isDomainTrusted(url: string, minScore: number = 0.7): boolean {
  const result = analyzeDomain(url);
  return result.score >= minScore;
}

/**
 * Get platform-specific metrics for known platforms
 */
export interface PlatformMetrics {
  platform: string;
  metrics: Record<string, number | string | boolean>;
  qualityScore: number;
}

/**
 * Detect platform from URL and return relevant metrics structure
 */
export function detectPlatform(url: string): { platform: string; extractable: string[] } | null {
  const domain = extractDomain(url);

  const platforms: Record<string, string[]> = {
    'github.com': ['stars', 'forks', 'contributors', 'issues', 'last_commit'],
    'twitter.com': ['followers', 'verified', 'engagement'],
    'x.com': ['followers', 'verified', 'engagement'],
    'medium.com': ['claps', 'responses', 'followers'],
    'dev.to': ['reactions', 'comments', 'views'],
    'arxiv.org': ['citations', 'category', 'year'],
    'stackoverflow.com': ['score', 'answers', 'views'],
  };

  for (const [platform, metrics] of Object.entries(platforms)) {
    if (domain === platform || domain.endsWith(`.${platform}`)) {
      return { platform, extractable: metrics };
    }
  }

  return null;
}
