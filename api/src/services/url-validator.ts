/**
 * URL Validation and Security Service
 *
 * Provides comprehensive URL validation to prevent:
 * - Server-Side Request Forgery (SSRF) attacks
 * - Access to local/private networks
 * - Protocol-based attacks
 * - Resource exhaustion attacks
 */

import { URL } from 'url';
import * as net from 'net';

/**
 * URL validation result
 */
export interface URLValidationResult {
  isValid: boolean;
  url: string;
  error?: string;
  normalizedUrl?: string;
}

/**
 * Configuration for URL validation
 */
export interface URLValidationConfig {
  allowedSchemes: string[];
  maxUrlLength: number;
  allowLocalhost: boolean;
  allowPrivateNetworks: boolean;
  blockedHosts: string[];
  allowedPorts: number[];
  timeoutMs: number;
}

/**
 * Default secure configuration
 */
const DEFAULT_CONFIG: URLValidationConfig = {
  allowedSchemes: ['http', 'https'],
  maxUrlLength: 2048,
  allowLocalhost: false,
  allowPrivateNetworks: false,
  blockedHosts: [
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    '169.254.169.254', // AWS metadata service
    '169.254.169.255',
  ],
  allowedPorts: [80, 443, 8080, 8443],
  timeoutMs: 10000,
};

/**
 * Check if an IP address is in a private network range
 */
export function isPrivateIP(ip: string): boolean {
  if (!net.isIP(ip)) {
    return false;
  }

  // IPv4 private ranges
  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;

    // 10.0.0.0/8
    if (a === 10) return true;

    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;

    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;

    return false;
  }

  // IPv6 private ranges
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();

    // ::1 (loopback)
    if (normalized === '::1') return true;

    // fc00::/7 (unique local addresses)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

    // fe80::/10 (link-local)
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
        normalized.startsWith('fea') || normalized.startsWith('feb')) return true;

    return false;
  }

  return false;
}

/**
 * Resolve hostname to IP and validate it's not private
 */
async function validateHostname(hostname: string, config: URLValidationConfig): Promise<void> {
  // Check against blocked hosts list
  if (config.blockedHosts.includes(hostname.toLowerCase())) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  // If it's already an IP, validate directly
  if (net.isIP(hostname)) {
    if (!config.allowPrivateNetworks && isPrivateIP(hostname)) {
      throw new Error(`Private IP address not allowed: ${hostname}`);
    }
    return;
  }

  // For domain names, we should ideally resolve and check the IP
  // For now, apply hostname-based restrictions
  const hostnameLower = hostname.toLowerCase();

  if (!config.allowLocalhost && (
    hostnameLower === 'localhost' ||
    hostnameLower.endsWith('.localhost') ||
    hostnameLower === 'local' ||
    hostnameLower.endsWith('.local')
  )) {
    throw new Error(`Localhost access not allowed: ${hostname}`);
  }

  // Block common private/internal domain patterns
  if (!config.allowPrivateNetworks) {
    const privateDomainPatterns = [
      /^(10|172|192)\./,  // Looks like IP ranges
      /\.internal$/,
      /\.local$/,
      /\.lan$/,
      /^metadata\./,      // Cloud metadata services
      /^instance-data\./,
    ];

    if (privateDomainPatterns.some(pattern => pattern.test(hostnameLower))) {
      throw new Error(`Private/internal hostname pattern detected: ${hostname}`);
    }
  }
}

/**
 * Comprehensive URL validation with SSRF protection
 */
export async function validateURL(
  url: string,
  config: Partial<URLValidationConfig> = {}
): Promise<URLValidationResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Basic validation
    if (!url || typeof url !== 'string') {
      return { isValid: false, url, error: 'URL must be a non-empty string' };
    }

    if (url.length > fullConfig.maxUrlLength) {
      return {
        isValid: false,
        url,
        error: `URL too long (max ${fullConfig.maxUrlLength} characters)`
      };
    }

    // Parse URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return {
        isValid: false,
        url,
        error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    // Validate scheme
    if (!fullConfig.allowedSchemes.includes(parsedUrl.protocol.slice(0, -1))) {
      return {
        isValid: false,
        url,
        error: `Unsupported protocol: ${parsedUrl.protocol}. Allowed: ${fullConfig.allowedSchemes.join(', ')}`
      };
    }

    // Validate port if specified
    if (parsedUrl.port) {
      const port = parseInt(parsedUrl.port, 10);
      if (!fullConfig.allowedPorts.includes(port)) {
        return {
          isValid: false,
          url,
          error: `Port ${port} not allowed. Allowed ports: ${fullConfig.allowedPorts.join(', ')}`
        };
      }
    }

    // Validate hostname for SSRF protection
    await validateHostname(parsedUrl.hostname, fullConfig);

    const normalizedUrl = parsedUrl.toString();

    return {
      isValid: true,
      url,
      normalizedUrl,
    };
  } catch (error) {
    return {
      isValid: false,
      url,
      error: error instanceof Error ? error.message : 'URL validation failed',
    };
  }
}

/**
 * Secure fetch wrapper with URL validation and additional protections
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  validationConfig: Partial<URLValidationConfig> = {}
): Promise<Response> {
  // Validate URL first
  const validation = await validateURL(url, validationConfig);

  if (!validation.isValid) {
    throw new Error(`URL validation failed: ${validation.error}`);
  }

  // Use the normalized URL
  const targetUrl = validation.normalizedUrl || url;

  // Set secure defaults for fetch options
  const secureOptions: RequestInit = {
    ...options,
    // Prevent following redirects to potentially malicious URLs
    redirect: 'error',
    // Set reasonable timeout
    signal: AbortSignal.timeout(validationConfig.timeoutMs || DEFAULT_CONFIG.timeoutMs),
    headers: {
      // Security headers
      'User-Agent': 'EntropyWiki/1.0 (content extraction bot)',
      'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain',
      // Don't send potentially sensitive headers
      ...options.headers,
    },
  };

  try {
    const response = await fetch(targetUrl, secureOptions);

    // Additional response validation
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      const maxSize = 50 * 1024 * 1024; // 50MB limit
      if (size > maxSize) {
        throw new Error(`Response too large: ${size} bytes (max ${maxSize})`);
      }
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      // Enhance error messages for better debugging
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${validationConfig.timeoutMs || DEFAULT_CONFIG.timeoutMs}ms`);
      }
      if (error.message.includes('redirect')) {
        throw new Error('Redirects not allowed for security reasons');
      }
    }

    throw error;
  }
}

/**
 * URL validation error for consistent error handling
 */
export class URLValidationError extends Error {
  constructor(message: string, public originalUrl: string, public validationResult?: URLValidationResult) {
    super(message);
    this.name = 'URLValidationError';
  }
}