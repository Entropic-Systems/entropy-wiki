/**
 * Twitter/X oEmbed Mock Service
 *
 * Mocks Twitter's oEmbed API for testing tweet embedding.
 */

import { BaseMockService, MockServiceConfig } from './types.js';

export interface TwitterOEmbedResponse {
  url: string;
  author_name: string;
  author_url: string;
  html: string;
  width: number;
  height: number | null;
  type: 'rich';
  cache_age: string;
  provider_name: string;
  provider_url: string;
  version: string;
}

export interface MockTweet {
  id: string;
  author: string;
  authorDisplayName: string;
  content: string;
  timestamp: string;
  retweets?: number;
  likes?: number;
  isDeleted?: boolean;
  isPrivate?: boolean;
}

export interface TwitterMockConfig extends MockServiceConfig {
  /** Default cache age in seconds */
  defaultCacheAge?: number;
}

/**
 * Twitter oEmbed Mock Service
 */
export class TwitterMockService extends BaseMockService {
  name = 'TwitterOEmbed';

  private tweets: Map<string, MockTweet> = new Map();
  private defaultCacheAge: number;
  private failureScenarios: Map<string, { status: number; message: string }> = new Map();

  constructor(config: TwitterMockConfig = {}) {
    super(config);
    this.defaultCacheAge = config.defaultCacheAge || 3153600000; // 100 years default
  }

  /**
   * Add a mock tweet
   */
  addTweet(tweet: MockTweet): void {
    this.tweets.set(tweet.id, tweet);
  }

  /**
   * Remove a mock tweet
   */
  removeTweet(id: string): void {
    this.tweets.delete(id);
  }

  /**
   * Set a failure scenario for a specific tweet
   */
  setFailure(tweetId: string, status: number, message: string): void {
    this.failureScenarios.set(tweetId, { status, message });
  }

  /**
   * Clear a failure scenario
   */
  clearFailure(tweetId: string): void {
    this.failureScenarios.delete(tweetId);
  }

  /**
   * Extract tweet ID from URL
   */
  private extractTweetId(url: string): string | null {
    const patterns = [
      /twitter\.com\/\w+\/status\/(\d+)/,
      /x\.com\/\w+\/status\/(\d+)/,
      /\/status\/(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Generate HTML embed for a tweet
   */
  private generateEmbedHtml(tweet: MockTweet): string {
    const escapedContent = tweet.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `<blockquote class="twitter-tweet">
<p lang="en" dir="ltr">${escapedContent}</p>
&mdash; ${tweet.authorDisplayName} (@${tweet.author})
<a href="https://twitter.com/${tweet.author}/status/${tweet.id}">${tweet.timestamp}</a>
</blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`;
  }

  /**
   * Mock: GET /oembed
   */
  async getOEmbed(url: string, options?: { maxwidth?: number; hide_thread?: boolean }): Promise<TwitterOEmbedResponse> {
    this.recordCall({
      method: 'GET',
      url: `/oembed?url=${encodeURIComponent(url)}`,
    });

    const tweetId = this.extractTweetId(url);
    if (!tweetId) {
      throw { status: 400, message: 'Invalid tweet URL' };
    }

    // Check failure scenarios
    const failure = this.failureScenarios.get(tweetId);
    if (failure) {
      throw failure;
    }

    // Get tweet
    const tweet = this.tweets.get(tweetId);
    if (!tweet) {
      throw { status: 404, message: 'Tweet not found' };
    }

    // Check tweet status
    if (tweet.isDeleted) {
      throw { status: 404, message: 'Tweet has been deleted' };
    }

    if (tweet.isPrivate) {
      throw { status: 403, message: 'Tweet is from a protected account' };
    }

    const html = this.generateEmbedHtml(tweet);

    return {
      url: `https://twitter.com/${tweet.author}/status/${tweet.id}`,
      author_name: tweet.authorDisplayName,
      author_url: `https://twitter.com/${tweet.author}`,
      html,
      width: options?.maxwidth || 550,
      height: null,
      type: 'rich',
      cache_age: String(this.defaultCacheAge),
      provider_name: 'Twitter',
      provider_url: 'https://twitter.com',
      version: '1.0',
    };
  }

  /**
   * Helper: Add a simple test tweet
   */
  addTestTweet(id: string, author: string, content: string): void {
    this.addTweet({
      id,
      author,
      authorDisplayName: author.charAt(0).toUpperCase() + author.slice(1),
      content,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Helper: Simulate deleted tweet
   */
  simulateDeletedTweet(id: string): void {
    const tweet = this.tweets.get(id);
    if (tweet) {
      tweet.isDeleted = true;
    }
  }

  /**
   * Helper: Simulate private tweet
   */
  simulatePrivateTweet(id: string): void {
    const tweet = this.tweets.get(id);
    if (tweet) {
      tweet.isPrivate = true;
    }
  }

  /**
   * Reset the mock service
   */
  override reset(): void {
    super.reset();
    this.tweets.clear();
    this.failureScenarios.clear();
  }
}

// Export singleton instance
export const twitterMock = new TwitterMockService();
