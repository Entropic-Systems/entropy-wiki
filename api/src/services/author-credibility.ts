/**
 * Author Credibility Service
 *
 * Assesses author/creator credibility based on:
 * - Platform verification status
 * - Historical content quality
 * - Community reputation signals
 * - Professional credentials
 */

import { query } from '../db/client.js';

/**
 * Author credibility result
 */
export interface AuthorCredibilityResult {
  authorId: string;
  platform: string;
  score: number;
  factors: {
    verification?: number;
    contentHistory?: number;
    communityReputation?: number;
    credentials?: number;
    activityConsistency?: number;
  };
  confidence: 'low' | 'medium' | 'high';
  warnings: string[];
}

/**
 * Platform-specific author identifiers
 */
export interface AuthorIdentifier {
  platform: string;
  username?: string;
  profileUrl?: string;
  displayName?: string;
}

/**
 * Known verified authors by platform
 */
const VERIFIED_AUTHORS: Record<string, Set<string>> = {
  'github.com': new Set([
    'torvalds', 'gaearon', 'sindresorhus', 'tj', 'yyx990803',
    'rauchg', 'kentcdodds', 'addyosmani', 'getify', 'developit',
  ]),
  'twitter.com': new Set([
    'elikikaiser', 'karpathy', 'ylecun', 'AndrewYNg', 'sama',
  ]),
  'x.com': new Set([
    'elikikaiser', 'karpathy', 'ylecun', 'AndrewYNg', 'sama',
  ]),
};

/**
 * Organization accounts with high credibility
 */
const TRUSTED_ORGANIZATIONS: Record<string, Set<string>> = {
  'github.com': new Set([
    'google', 'microsoft', 'facebook', 'meta', 'apple', 'amazon',
    'openai', 'anthropic', 'vercel', 'nodejs', 'rust-lang',
    'python', 'golang', 'kubernetes', 'docker', 'tensorflow',
    'pytorch', 'huggingface', 'elastic', 'mongodb', 'redis',
  ]),
};

/**
 * Extract author identifier from URL
 */
export function extractAuthorFromUrl(url: string): AuthorIdentifier | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(p => p.length > 0);

    switch (hostname) {
      case 'github.com':
        if (pathParts.length >= 1) {
          return {
            platform: hostname,
            username: pathParts[0],
            profileUrl: `https://github.com/${pathParts[0]}`,
          };
        }
        break;

      case 'twitter.com':
      case 'x.com':
        if (pathParts.length >= 1 && !pathParts[0].startsWith('i/')) {
          return {
            platform: hostname,
            username: pathParts[0],
            profileUrl: `https://${hostname}/${pathParts[0]}`,
          };
        }
        break;

      case 'medium.com':
        if (pathParts.length >= 1) {
          const username = pathParts[0].startsWith('@')
            ? pathParts[0].slice(1)
            : pathParts[0];
          return {
            platform: hostname,
            username,
            profileUrl: `https://medium.com/@${username}`,
          };
        }
        break;

      case 'dev.to':
        if (pathParts.length >= 1) {
          return {
            platform: hostname,
            username: pathParts[0],
            profileUrl: `https://dev.to/${pathParts[0]}`,
          };
        }
        break;

      case 'stackoverflow.com':
        if (pathParts[0] === 'users' && pathParts.length >= 2) {
          return {
            platform: hostname,
            username: pathParts[1],
            profileUrl: `https://stackoverflow.com/users/${pathParts[1]}`,
          };
        }
        break;

      case 'arxiv.org':
        // arXiv doesn't have traditional author profiles
        return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if author is verified on platform
 */
export function checkVerificationStatus(author: AuthorIdentifier): number {
  const username = author.username?.toLowerCase();
  if (!username) return 0;

  // Check known verified authors
  const verifiedSet = VERIFIED_AUTHORS[author.platform];
  if (verifiedSet?.has(username)) {
    return 1.0;
  }

  // Check trusted organizations
  const orgSet = TRUSTED_ORGANIZATIONS[author.platform];
  if (orgSet?.has(username)) {
    return 0.95;
  }

  // Default - no verification info
  return 0.5;
}

/**
 * Assess content history quality (stub - would need API/DB lookup)
 */
export async function assessContentHistory(
  author: AuthorIdentifier
): Promise<{ score: number; sampleSize: number }> {
  // In production, this would:
  // 1. Look up author's previous content in our database
  // 2. Calculate average quality scores
  // 3. Consider content volume and consistency

  // For now, use verification as proxy
  const verificationScore = checkVerificationStatus(author);

  return {
    score: verificationScore * 0.8 + 0.2, // Baseline + verification bonus
    sampleSize: 0, // No real data yet
  };
}

/**
 * Assess community reputation signals
 */
export function assessCommunityReputation(
  author: AuthorIdentifier,
  metrics?: {
    followers?: number;
    following?: number;
    contributions?: number;
    stars?: number;
    reputation?: number;
  }
): number {
  if (!metrics) {
    // No metrics available - use neutral score
    return 0.5;
  }

  let score = 0.5;
  const signals: number[] = [];

  // Follower/following ratio (if available)
  if (metrics.followers !== undefined && metrics.following !== undefined) {
    if (metrics.following > 0) {
      const ratio = metrics.followers / metrics.following;
      // Ratio > 1 is positive signal, but cap at 10x
      signals.push(Math.min(0.3 + ratio * 0.07, 1.0));
    } else if (metrics.followers > 0) {
      signals.push(0.9); // Has followers but follows no one
    }
  }

  // Absolute follower count
  if (metrics.followers !== undefined) {
    // Log scale: 10 followers = 0.3, 100 = 0.5, 1000 = 0.7, 10000 = 0.9
    const followerScore = Math.min(0.2 + Math.log10(metrics.followers + 1) * 0.175, 1.0);
    signals.push(followerScore);
  }

  // GitHub stars (if applicable)
  if (metrics.stars !== undefined) {
    // Log scale for stars
    const starScore = Math.min(0.3 + Math.log10(metrics.stars + 1) * 0.175, 1.0);
    signals.push(starScore);
  }

  // Stack Overflow reputation
  if (metrics.reputation !== undefined) {
    // Log scale: 100 = 0.3, 1000 = 0.5, 10000 = 0.7, 100000 = 0.9
    const repScore = Math.min(0.1 + Math.log10(metrics.reputation + 1) * 0.2, 1.0);
    signals.push(repScore);
  }

  // Contribution count
  if (metrics.contributions !== undefined) {
    // Log scale for contributions
    const contribScore = Math.min(0.2 + Math.log10(metrics.contributions + 1) * 0.2, 1.0);
    signals.push(contribScore);
  }

  // Average all available signals
  if (signals.length > 0) {
    score = signals.reduce((a, b) => a + b, 0) / signals.length;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Check for professional credentials indicators
 */
export function assessCredentials(
  author: AuthorIdentifier,
  bio?: string,
  affiliations?: string[]
): number {
  let score = 0.5; // Neutral baseline
  const bonuses: number[] = [];

  // Check affiliations
  const trustedAffiliations = [
    'google', 'microsoft', 'meta', 'facebook', 'amazon', 'apple',
    'openai', 'anthropic', 'deepmind', 'nvidia', 'intel', 'amd',
    'stanford', 'mit', 'berkeley', 'cmu', 'harvard', 'oxford', 'cambridge',
    'phd', 'professor', 'researcher', 'engineer', 'scientist',
  ];

  if (affiliations) {
    for (const aff of affiliations) {
      const affLower = aff.toLowerCase();
      for (const trusted of trustedAffiliations) {
        if (affLower.includes(trusted)) {
          bonuses.push(0.15);
          break;
        }
      }
    }
  }

  // Check bio for credential indicators
  if (bio) {
    const bioLower = bio.toLowerCase();
    for (const trusted of trustedAffiliations) {
      if (bioLower.includes(trusted)) {
        bonuses.push(0.1);
      }
    }

    // Cap bio bonuses
    const bioBonusTotal = Math.min(
      bonuses.filter((_, i) => i >= (affiliations?.length || 0)).reduce((a, b) => a + b, 0),
      0.3
    );
    bonuses.length = affiliations?.length || 0;
    if (bioBonusTotal > 0) bonuses.push(bioBonusTotal);
  }

  // Apply bonuses (cap at 0.4 total bonus)
  const totalBonus = Math.min(bonuses.reduce((a, b) => a + b, 0), 0.4);
  score += totalBonus;

  return Math.min(score, 1.0);
}

/**
 * Assess activity consistency
 */
export function assessActivityConsistency(
  activityDates?: Date[],
  accountAge?: Date
): number {
  if (!activityDates || activityDates.length === 0) {
    return 0.5; // Neutral if no data
  }

  // Sort dates
  const sorted = [...activityDates].sort((a, b) => a.getTime() - b.getTime());
  const now = new Date();

  // Check recent activity
  const mostRecent = sorted[sorted.length - 1];
  const daysSinceActivity = (now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24);

  let recencyScore = 1.0;
  if (daysSinceActivity > 365) {
    recencyScore = 0.3; // Very stale
  } else if (daysSinceActivity > 180) {
    recencyScore = 0.5;
  } else if (daysSinceActivity > 90) {
    recencyScore = 0.7;
  } else if (daysSinceActivity > 30) {
    recencyScore = 0.85;
  }

  // Check account age if available
  let ageScore = 0.5;
  if (accountAge) {
    const accountAgeDays = (now.getTime() - accountAge.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays > 365 * 5) {
      ageScore = 1.0; // 5+ years
    } else if (accountAgeDays > 365 * 2) {
      ageScore = 0.85; // 2-5 years
    } else if (accountAgeDays > 365) {
      ageScore = 0.7; // 1-2 years
    } else if (accountAgeDays > 180) {
      ageScore = 0.5; // 6-12 months
    } else {
      ageScore = 0.3; // < 6 months
    }
  }

  // Calculate activity spread (consistent vs bursty)
  let consistencyScore = 0.5;
  if (sorted.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].getTime() - sorted[i - 1].getTime());
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);

    // Lower relative standard deviation = more consistent
    const relativeStdDev = avgGap > 0 ? stdDev / avgGap : 0;
    consistencyScore = Math.max(0.3, 1 - relativeStdDev * 0.5);
  }

  // Weighted combination
  return recencyScore * 0.4 + ageScore * 0.3 + consistencyScore * 0.3;
}

/**
 * Main function to assess author credibility
 */
export async function assessAuthorCredibility(
  url: string,
  additionalContext?: {
    bio?: string;
    affiliations?: string[];
    metrics?: {
      followers?: number;
      following?: number;
      contributions?: number;
      stars?: number;
      reputation?: number;
    };
    activityDates?: Date[];
    accountCreated?: Date;
  }
): Promise<AuthorCredibilityResult> {
  const author = extractAuthorFromUrl(url);
  const warnings: string[] = [];

  if (!author) {
    return {
      authorId: 'unknown',
      platform: 'unknown',
      score: 0.5,
      factors: {},
      confidence: 'low',
      warnings: ['Could not extract author information from URL'],
    };
  }

  const factors: AuthorCredibilityResult['factors'] = {};

  // 1. Verification status
  factors.verification = checkVerificationStatus(author);

  // 2. Content history
  const historyResult = await assessContentHistory(author);
  factors.contentHistory = historyResult.score;
  if (historyResult.sampleSize === 0) {
    warnings.push('No content history available');
  }

  // 3. Community reputation
  factors.communityReputation = assessCommunityReputation(
    author,
    additionalContext?.metrics
  );
  if (!additionalContext?.metrics) {
    warnings.push('No community metrics available');
  }

  // 4. Credentials
  factors.credentials = assessCredentials(
    author,
    additionalContext?.bio,
    additionalContext?.affiliations
  );

  // 5. Activity consistency
  factors.activityConsistency = assessActivityConsistency(
    additionalContext?.activityDates,
    additionalContext?.accountCreated
  );
  if (!additionalContext?.activityDates) {
    warnings.push('No activity history available');
  }

  // Calculate weighted score
  const weights = {
    verification: 0.25,
    contentHistory: 0.25,
    communityReputation: 0.20,
    credentials: 0.15,
    activityConsistency: 0.15,
  };

  const score =
    (factors.verification || 0.5) * weights.verification +
    (factors.contentHistory || 0.5) * weights.contentHistory +
    (factors.communityReputation || 0.5) * weights.communityReputation +
    (factors.credentials || 0.5) * weights.credentials +
    (factors.activityConsistency || 0.5) * weights.activityConsistency;

  // Determine confidence based on available data
  const availableFactors = Object.values(factors).filter(v => v !== undefined).length;
  let confidence: 'low' | 'medium' | 'high';
  if (availableFactors >= 4 && !warnings.includes('No community metrics available')) {
    confidence = 'high';
  } else if (availableFactors >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    authorId: author.username || 'unknown',
    platform: author.platform,
    score: Math.max(0, Math.min(1, score)),
    factors,
    confidence,
    warnings,
  };
}

/**
 * Store author credibility assessment
 */
export async function storeAuthorCredibility(
  result: AuthorCredibilityResult
): Promise<void> {
  // This would store in a dedicated author_credibility table
  // For now, we can leverage source_reliability with author-specific metadata
  await query(`
    INSERT INTO source_reliability (
      domain, overall_score, platform_metrics, confidence_level, last_evaluated
    ) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (domain) DO UPDATE SET
      overall_score = EXCLUDED.overall_score,
      platform_metrics = EXCLUDED.platform_metrics,
      confidence_level = EXCLUDED.confidence_level,
      last_evaluated = NOW(),
      updated_at = NOW()
  `, [
    `author:${result.platform}:${result.authorId}`,
    result.score,
    JSON.stringify({
      type: 'author',
      factors: result.factors,
      warnings: result.warnings,
    }),
    result.confidence,
  ]);
}

/**
 * Get stored author credibility
 */
export async function getAuthorCredibility(
  platform: string,
  authorId: string
): Promise<AuthorCredibilityResult | null> {
  const result = await query<{
    overall_score: number;
    platform_metrics: any;
    confidence_level: string;
  }>(`
    SELECT overall_score, platform_metrics, confidence_level
    FROM source_reliability
    WHERE domain = $1
  `, [`author:${platform}:${authorId}`]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const metrics = row.platform_metrics || {};

  return {
    authorId,
    platform,
    score: row.overall_score,
    factors: metrics.factors || {},
    confidence: row.confidence_level as 'low' | 'medium' | 'high',
    warnings: metrics.warnings || [],
  };
}
