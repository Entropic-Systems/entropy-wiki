/**
 * Configuration Validator Service
 *
 * Validates API tokens and configuration for the debug workflow system.
 * Provides health checking for external service connections.
 *
 * Features:
 * - API token validation for all external services
 * - Service endpoint health checking
 * - Configuration completeness verification
 * - Rate limit and quota monitoring
 *
 * Bead: entropy-wiki-1ns
 */

// Configuration status types
export type ConfigStatus = 'valid' | 'invalid' | 'missing' | 'unchecked';

export interface TokenValidation {
  service: string;
  token: string;
  status: ConfigStatus;
  message?: string;
  scopes?: string[];
  rateLimit?: {
    remaining: number;
    limit: number;
    reset: Date;
  };
}

export interface ServiceConfig {
  service: string;
  required: boolean;
  configured: boolean;
  envVar: string;
  validation?: TokenValidation;
}

export interface ConfigValidationResult {
  validatedAt: string;
  allRequired: boolean;
  allValid: boolean;
  services: ServiceConfig[];
  warnings: string[];
  errors: string[];
}

// Service definitions
const SERVICE_CONFIGS: Array<{
  service: string;
  envVar: string;
  required: boolean;
  validate: (token: string) => Promise<TokenValidation>;
}> = [
  {
    service: 'github',
    envVar: 'GITHUB_TOKEN',
    required: false,
    validate: validateGitHubToken,
  },
  {
    service: 'railway',
    envVar: 'RAILWAY_TOKEN',
    required: false,
    validate: validateRailwayToken,
  },
  {
    service: 'vercel',
    envVar: 'VERCEL_TOKEN',
    required: false,
    validate: validateVercelToken,
  },
];

/**
 * Validate GitHub token
 */
async function validateGitHubToken(token: string): Promise<TokenValidation> {
  const result: TokenValidation = {
    service: 'github',
    token: maskToken(token),
    status: 'unchecked',
  };

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.ok) {
      result.status = 'valid';
      result.message = 'Token is valid';

      // Parse rate limit headers
      const remaining = response.headers.get('x-ratelimit-remaining');
      const limit = response.headers.get('x-ratelimit-limit');
      const reset = response.headers.get('x-ratelimit-reset');

      if (remaining && limit && reset) {
        result.rateLimit = {
          remaining: parseInt(remaining, 10),
          limit: parseInt(limit, 10),
          reset: new Date(parseInt(reset, 10) * 1000),
        };
      }

      // Check scopes
      const scopes = response.headers.get('x-oauth-scopes');
      if (scopes) {
        result.scopes = scopes.split(',').map(s => s.trim());
      }
    } else if (response.status === 401) {
      result.status = 'invalid';
      result.message = 'Token is invalid or expired';
    } else {
      result.status = 'invalid';
      result.message = `API returned status ${response.status}`;
    }
  } catch (error) {
    result.status = 'invalid';
    result.message = error instanceof Error ? error.message : 'Connection failed';
  }

  return result;
}

/**
 * Validate Railway token
 */
async function validateRailwayToken(token: string): Promise<TokenValidation> {
  const result: TokenValidation = {
    service: 'railway',
    token: maskToken(token),
    status: 'unchecked',
  };

  try {
    // Railway uses GraphQL API
    const response = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '{ me { id email } }',
      }),
    });

    if (response.ok) {
      const data = await response.json() as { data?: { me?: { id: string } }; errors?: unknown[] };
      if (data.data?.me?.id) {
        result.status = 'valid';
        result.message = 'Token is valid';
      } else if (data.errors) {
        result.status = 'invalid';
        result.message = 'GraphQL query failed';
      }
    } else if (response.status === 401) {
      result.status = 'invalid';
      result.message = 'Token is invalid or expired';
    } else {
      result.status = 'invalid';
      result.message = `API returned status ${response.status}`;
    }
  } catch (error) {
    result.status = 'invalid';
    result.message = error instanceof Error ? error.message : 'Connection failed';
  }

  return result;
}

/**
 * Validate Vercel token
 */
async function validateVercelToken(token: string): Promise<TokenValidation> {
  const result: TokenValidation = {
    service: 'vercel',
    token: maskToken(token),
    status: 'unchecked',
  };

  try {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      result.status = 'valid';
      result.message = 'Token is valid';
    } else if (response.status === 401 || response.status === 403) {
      result.status = 'invalid';
      result.message = 'Token is invalid or expired';
    } else {
      result.status = 'invalid';
      result.message = `API returned status ${response.status}`;
    }
  } catch (error) {
    result.status = 'invalid';
    result.message = error instanceof Error ? error.message : 'Connection failed';
  }

  return result;
}

/**
 * Mask token for display
 */
function maskToken(token: string): string {
  if (token.length <= 8) {
    return '***';
  }
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

/**
 * Configuration Validator class
 */
export class ConfigValidator {
  /**
   * Validate all configured services
   */
  async validateAll(validateTokens: boolean = true): Promise<ConfigValidationResult> {
    const services: ServiceConfig[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const config of SERVICE_CONFIGS) {
      const token = process.env[config.envVar];
      const configured = Boolean(token && token.length > 0);

      const serviceConfig: ServiceConfig = {
        service: config.service,
        required: config.required,
        configured,
        envVar: config.envVar,
      };

      if (!configured) {
        if (config.required) {
          errors.push(`Missing required ${config.envVar}`);
        } else {
          warnings.push(`Optional ${config.envVar} not configured - ${config.service} collector will be skipped`);
        }
      } else if (validateTokens && token) {
        // Validate token
        const validation = await config.validate(token);
        serviceConfig.validation = validation;

        if (validation.status === 'invalid') {
          if (config.required) {
            errors.push(`Invalid ${config.envVar}: ${validation.message}`);
          } else {
            warnings.push(`Invalid ${config.envVar}: ${validation.message}`);
          }
        }

        // Check rate limits
        if (validation.rateLimit && validation.rateLimit.remaining < 100) {
          warnings.push(`${config.service} rate limit low: ${validation.rateLimit.remaining}/${validation.rateLimit.limit}`);
        }
      }

      services.push(serviceConfig);
    }

    const allRequired = services
      .filter(s => s.required)
      .every(s => s.configured && (!s.validation || s.validation.status === 'valid'));

    const allValid = services
      .filter(s => s.configured)
      .every(s => !s.validation || s.validation.status === 'valid');

    return {
      validatedAt: new Date().toISOString(),
      allRequired,
      allValid,
      services,
      warnings,
      errors,
    };
  }

  /**
   * Quick check without token validation
   */
  checkConfiguration(): {
    configured: string[];
    missing: string[];
    required: string[];
  } {
    const configured: string[] = [];
    const missing: string[] = [];
    const required: string[] = [];

    for (const config of SERVICE_CONFIGS) {
      const token = process.env[config.envVar];
      if (token && token.length > 0) {
        configured.push(config.service);
      } else {
        missing.push(config.service);
        if (config.required) {
          required.push(config.service);
        }
      }
    }

    return { configured, missing, required };
  }

  /**
   * Get rate limit information for all configured services
   */
  async getRateLimits(): Promise<Record<string, TokenValidation['rateLimit']>> {
    const limits: Record<string, TokenValidation['rateLimit']> = {};

    for (const config of SERVICE_CONFIGS) {
      const token = process.env[config.envVar];
      if (token) {
        const validation = await config.validate(token);
        if (validation.rateLimit) {
          limits[config.service] = validation.rateLimit;
        }
      }
    }

    return limits;
  }

  /**
   * Generate configuration status report
   */
  async generateReport(): Promise<string> {
    const result = await this.validateAll(true);
    const lines: string[] = [];

    lines.push('# Debug Workflow Configuration Report');
    lines.push('');
    lines.push(`**Generated:** ${result.validatedAt}`);
    lines.push(`**All Required:** ${result.allRequired ? '✅ Yes' : '❌ No'}`);
    lines.push(`**All Valid:** ${result.allValid ? '✅ Yes' : '❌ No'}`);
    lines.push('');

    lines.push('## Service Configuration');
    lines.push('');
    lines.push('| Service | Env Var | Configured | Valid | Rate Limit |');
    lines.push('|---------|---------|------------|-------|------------|');

    for (const service of result.services) {
      const configured = service.configured ? '✅' : '❌';
      const valid = service.validation
        ? (service.validation.status === 'valid' ? '✅' : '❌')
        : '-';
      const rateLimit = service.validation?.rateLimit
        ? `${service.validation.rateLimit.remaining}/${service.validation.rateLimit.limit}`
        : '-';

      lines.push(`| ${service.service} | ${service.envVar} | ${configured} | ${valid} | ${rateLimit} |`);
    }
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('## Errors');
      lines.push('');
      for (const error of result.errors) {
        lines.push(`- ❌ ${error}`);
      }
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('## Warnings');
      lines.push('');
      for (const warning of result.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export const configValidator = new ConfigValidator();

// Export factory function
export function createConfigValidator(): ConfigValidator {
  return new ConfigValidator();
}
