/**
 * Source Reliability Scoring Service
 *
 * Orchestrates multi-factor reliability assessment:
 * - Domain authority (from domain-analyzer)
 * - Content quality history
 * - Author credibility (from author-credibility)
 * - Platform-specific metrics
 * - Freshness factor
 *
 * reliability_score = (
 *   domain_authority * 0.25 +
 *   content_quality_history * 0.30 +
 *   author_credibility * 0.20 +
 *   platform_metrics * 0.15 +
 *   freshness_factor * 0.10
 * )
 */

import { query } from '../db/client.js';
import {
  analyzeDomain,
  extractDomain,
  isDomainTrusted,
  detectPlatform,
  DomainAuthorityResult,
  PlatformMetrics,
} from './domain-analyzer.js';
import {
  assessAuthorCredibility,
  extractAuthorFromUrl,
  AuthorCredibilityResult,
} from './author-credibility.js';

/**
 * Complete source reliability result
 */
export interface SourceReliabilityResult {
  url: string;
  domain: string;
  overallScore: number;
  factors: {
    domainAuthority: number;
    contentQualityHistory: number;
    authorCredibility: number;
    platformMetrics: number;
    freshnessFactor: number;
  };
  breakdown: {
    domain: DomainAuthorityResult;
    author?: AuthorCredibilityResult;
    platform?: PlatformMetrics;
  };
  confidence: 'low' | 'medium' | 'high';
  recommendation: 'trusted' | 'acceptable' | 'review' | 'untrusted';
  warnings: string[];
  evaluatedAt: Date;
}

/**
 * Source input for reliability assessment
 */
export interface SourceInput {
  url: string;
  contentSample?: string;
  publishDate?: Date;
  authorInfo?: {
    bio?: string;
    affiliations?: string[];
    metrics?: {
      followers?: number;
      following?: number;
      contributions?: number;
      stars?: number;
      reputation?: number;
    };
  };
}

/**
 * Weight configuration for scoring model
 */
const SCORING_WEIGHTS = {
  domainAuthority: 0.25,
  contentQualityHistory: 0.30,
  authorCredibility: 0.20,
  platformMetrics: 0.15,
  freshnessFactor: 0.10,
} as const;

/**
 * Thresholds for recommendation classification
 */
const RECOMMENDATION_THRESHOLDS = {
  trusted: 0.80,
  acceptable: 0.60,
  review: 0.40,
} as const;

/**
 * Calculate freshness factor based on publish date
 */
export function calculateFreshnessFactor(publishDate?: Date): number {
  if (!publishDate) {
    return 0.5; // Neutral if no date
  }

  const now = new Date();
  const ageInDays = (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24);

  // Decay function: starts at 1.0, decays over time
  // - < 30 days: 1.0 (very fresh)
  // - 30-90 days: 0.9-0.8
  // - 90-180 days: 0.8-0.6
  // - 180-365 days: 0.6-0.4
  // - > 365 days: 0.4-0.2 (depending on age)

  if (ageInDays < 30) {
    return 1.0;
  } else if (ageInDays < 90) {
    return 0.9 - (ageInDays - 30) * 0.00167; // Linear decay to 0.8
  } else if (ageInDays < 180) {
    return 0.8 - (ageInDays - 90) * 0.00222; // Linear decay to 0.6
  } else if (ageInDays < 365) {
    return 0.6 - (ageInDays - 180) * 0.00108; // Linear decay to 0.4
  } else if (ageInDays < 730) {
    return 0.4 - (ageInDays - 365) * 0.000548; // Linear decay to 0.2
  } else {
    return 0.2; // Floor for very old content
  }
}

/**
 * Get content quality history for a domain
 */
export async function getContentQualityHistory(domain: string): Promise<{
  score: number;
  sampleSize: number;
  avgQuality: number;
}> {
  // Look up historical quality scores for pages from this domain
  const result = await query<{
    avg_quality: number;
    sample_size: number;
  }>(`
    SELECT
      AVG(cqm.quality_score) as avg_quality,
      COUNT(*) as sample_size
    FROM content_quality_metrics cqm
    JOIN pages p ON p.slug = cqm.page_slug
    WHERE p.source_url LIKE $1
      AND cqm.quality_score IS NOT NULL
  `, [`%${domain}%`]);

  if (result.rows.length === 0 || result.rows[0].sample_size === 0) {
    return {
      score: 0.5, // Neutral default
      sampleSize: 0,
      avgQuality: 0.5,
    };
  }

  const { avg_quality, sample_size } = result.rows[0];

  // Confidence adjustment based on sample size
  // More samples = more confidence in the average
  const confidenceFactor = Math.min(sample_size / 10, 1); // Max confidence at 10+ samples

  // Blend with neutral based on confidence
  const adjustedScore = avg_quality * confidenceFactor + 0.5 * (1 - confidenceFactor);

  return {
    score: adjustedScore,
    sampleSize: sample_size,
    avgQuality: avg_quality,
  };
}

/**
 * Extract platform-specific metrics
 */
export async function extractPlatformMetrics(
  url: string,
  contentSample?: string
): Promise<PlatformMetrics | null> {
  const platformInfo = detectPlatform(url);
  if (!platformInfo) return null;

  // In production, this would call platform APIs to get actual metrics
  // For now, return structure with default values

  const metrics: Record<string, number | string | boolean> = {};

  // Set defaults based on platform
  switch (platformInfo.platform) {
    case 'github.com':
      metrics.stars = 0;
      metrics.forks = 0;
      metrics.issues = 0;
      metrics.hasReadme = true;
      break;
    case 'stackoverflow.com':
      metrics.score = 0;
      metrics.answers = 0;
      metrics.accepted = false;
      break;
    case 'arxiv.org':
      metrics.citations = 0;
      metrics.peerReviewed = false;
      break;
    default:
      break;
  }

  // Calculate quality score based on available metrics
  let qualityScore = 0.5;

  // GitHub scoring
  if (platformInfo.platform === 'github.com') {
    const stars = (metrics.stars as number) || 0;
    const forks = (metrics.forks as number) || 0;
    // Log scale scoring
    qualityScore = Math.min(
      0.4 + Math.log10(stars + 1) * 0.15 + Math.log10(forks + 1) * 0.1,
      1.0
    );
  }

  // Stack Overflow scoring
  if (platformInfo.platform === 'stackoverflow.com') {
    const score = (metrics.score as number) || 0;
    const accepted = metrics.accepted as boolean;
    qualityScore = Math.min(0.3 + score * 0.02 + (accepted ? 0.2 : 0), 1.0);
  }

  return {
    platform: platformInfo.platform,
    metrics,
    qualityScore,
  };
}

/**
 * Main function to assess source reliability
 */
export async function assessSourceReliability(
  input: SourceInput
): Promise<SourceReliabilityResult> {
  const warnings: string[] = [];
  const domain = extractDomain(input.url);

  // 1. Domain authority assessment
  const domainResult = analyzeDomain(input.url);
  warnings.push(...domainResult.warnings);

  // 2. Content quality history
  const qualityHistory = await getContentQualityHistory(domain);
  if (qualityHistory.sampleSize === 0) {
    warnings.push('No content quality history for this domain');
  }

  // 3. Author credibility
  let authorResult: AuthorCredibilityResult | undefined;
  const authorId = extractAuthorFromUrl(input.url);

  if (authorId) {
    authorResult = await assessAuthorCredibility(input.url, {
      bio: input.authorInfo?.bio,
      affiliations: input.authorInfo?.affiliations,
      metrics: input.authorInfo?.metrics,
    });
    warnings.push(...authorResult.warnings);
  } else {
    warnings.push('Could not extract author information');
  }

  // 4. Platform metrics
  const platformResult = await extractPlatformMetrics(input.url, input.contentSample);

  // 5. Freshness factor
  const freshnessFactor = calculateFreshnessFactor(input.publishDate);
  if (!input.publishDate) {
    warnings.push('No publish date available');
  }

  // Calculate factor scores
  const factors = {
    domainAuthority: domainResult.score,
    contentQualityHistory: qualityHistory.score,
    authorCredibility: authorResult?.score ?? 0.5,
    platformMetrics: platformResult?.qualityScore ?? 0.5,
    freshnessFactor,
  };

  // Calculate overall score using weighted model
  const overallScore =
    factors.domainAuthority * SCORING_WEIGHTS.domainAuthority +
    factors.contentQualityHistory * SCORING_WEIGHTS.contentQualityHistory +
    factors.authorCredibility * SCORING_WEIGHTS.authorCredibility +
    factors.platformMetrics * SCORING_WEIGHTS.platformMetrics +
    factors.freshnessFactor * SCORING_WEIGHTS.freshnessFactor;

  // Determine recommendation
  let recommendation: SourceReliabilityResult['recommendation'];
  if (overallScore >= RECOMMENDATION_THRESHOLDS.trusted) {
    recommendation = 'trusted';
  } else if (overallScore >= RECOMMENDATION_THRESHOLDS.acceptable) {
    recommendation = 'acceptable';
  } else if (overallScore >= RECOMMENDATION_THRESHOLDS.review) {
    recommendation = 'review';
  } else {
    recommendation = 'untrusted';
  }

  // Determine confidence
  let confidence: 'low' | 'medium' | 'high';
  const dataPoints = [
    qualityHistory.sampleSize > 0,
    authorResult !== undefined,
    platformResult !== null,
    input.publishDate !== undefined,
  ].filter(Boolean).length;

  if (dataPoints >= 3) {
    confidence = 'high';
  } else if (dataPoints >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    url: input.url,
    domain,
    overallScore: Math.max(0, Math.min(1, overallScore)),
    factors,
    breakdown: {
      domain: domainResult,
      author: authorResult,
      platform: platformResult ?? undefined,
    },
    confidence,
    recommendation,
    warnings,
    evaluatedAt: new Date(),
  };
}

/**
 * Store source reliability assessment
 */
export async function storeSourceReliability(
  result: SourceReliabilityResult
): Promise<void> {
  await query(`
    INSERT INTO source_reliability (
      domain,
      overall_score,
      domain_authority,
      content_quality_history,
      platform_metrics,
      confidence_level,
      last_evaluated
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (domain) DO UPDATE SET
      overall_score = EXCLUDED.overall_score,
      domain_authority = EXCLUDED.domain_authority,
      content_quality_history = EXCLUDED.content_quality_history,
      platform_metrics = EXCLUDED.platform_metrics,
      confidence_level = EXCLUDED.confidence_level,
      last_evaluated = EXCLUDED.last_evaluated,
      updated_at = NOW()
  `, [
    result.domain,
    result.overallScore,
    result.factors.domainAuthority,
    result.factors.contentQualityHistory,
    JSON.stringify({
      author: result.breakdown.author,
      platform: result.breakdown.platform,
      freshness: result.factors.freshnessFactor,
      warnings: result.warnings,
    }),
    result.confidence,
    result.evaluatedAt,
  ]);
}

/**
 * Get stored reliability for a domain
 */
export async function getStoredReliability(domain: string): Promise<{
  score: number;
  confidence: string;
  lastEvaluated: Date;
} | null> {
  const result = await query<{
    overall_score: number;
    confidence_level: string;
    last_evaluated: Date;
  }>(`
    SELECT overall_score, confidence_level, last_evaluated
    FROM source_reliability
    WHERE domain = $1
  `, [domain]);

  if (result.rows.length === 0) return null;

  return {
    score: result.rows[0].overall_score,
    confidence: result.rows[0].confidence_level,
    lastEvaluated: result.rows[0].last_evaluated,
  };
}

/**
 * Batch assess multiple sources
 */
export async function batchAssessReliability(
  sources: SourceInput[]
): Promise<SourceReliabilityResult[]> {
  const results: SourceReliabilityResult[] = [];

  for (const source of sources) {
    try {
      const result = await assessSourceReliability(source);
      results.push(result);
    } catch (error: any) {
      console.error(`Failed to assess ${source.url}:`, error.message);
      // Return a low-confidence result for failed assessments
      results.push({
        url: source.url,
        domain: extractDomain(source.url),
        overallScore: 0.3,
        factors: {
          domainAuthority: 0.3,
          contentQualityHistory: 0.5,
          authorCredibility: 0.5,
          platformMetrics: 0.5,
          freshnessFactor: 0.5,
        },
        breakdown: {
          domain: analyzeDomain(source.url),
        },
        confidence: 'low',
        recommendation: 'review',
        warnings: [`Assessment failed: ${error.message}`],
        evaluatedAt: new Date(),
      });
    }
  }

  return results;
}

/**
 * Check if a source meets minimum reliability threshold
 */
export async function isSourceReliable(
  url: string,
  minScore: number = 0.6
): Promise<boolean> {
  // First check cached result
  const domain = extractDomain(url);
  const cached = await getStoredReliability(domain);

  if (cached) {
    // Use cached result if recent (< 7 days)
    const ageInDays = (Date.now() - cached.lastEvaluated.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) {
      return cached.score >= minScore;
    }
  }

  // Assess and store new result
  const result = await assessSourceReliability({ url });
  await storeSourceReliability(result);

  return result.overallScore >= minScore;
}

/**
 * Get reliability breakdown for display
 */
export function formatReliabilityReport(result: SourceReliabilityResult): string {
  const lines: string[] = [
    `Source Reliability Report`,
    `========================`,
    `URL: ${result.url}`,
    `Domain: ${result.domain}`,
    ``,
    `Overall Score: ${(result.overallScore * 100).toFixed(1)}%`,
    `Recommendation: ${result.recommendation.toUpperCase()}`,
    `Confidence: ${result.confidence}`,
    ``,
    `Factor Breakdown:`,
    `  Domain Authority:      ${(result.factors.domainAuthority * 100).toFixed(1)}% (weight: 25%)`,
    `  Content Quality Hist:  ${(result.factors.contentQualityHistory * 100).toFixed(1)}% (weight: 30%)`,
    `  Author Credibility:    ${(result.factors.authorCredibility * 100).toFixed(1)}% (weight: 20%)`,
    `  Platform Metrics:      ${(result.factors.platformMetrics * 100).toFixed(1)}% (weight: 15%)`,
    `  Freshness Factor:      ${(result.factors.freshnessFactor * 100).toFixed(1)}% (weight: 10%)`,
  ];

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (result.breakdown.domain.category) {
    lines.push('');
    lines.push(`Domain Category: ${result.breakdown.domain.category}`);
  }

  lines.push('');
  lines.push(`Evaluated: ${result.evaluatedAt.toISOString()}`);

  return lines.join('\n');
}

// Re-export key types and functions
export {
  analyzeDomain,
  isDomainTrusted,
  extractDomain,
  detectPlatform,
} from './domain-analyzer.js';

export {
  assessAuthorCredibility,
  extractAuthorFromUrl,
} from './author-credibility.js';
