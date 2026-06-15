import * as fs from 'fs';
import * as path from 'path';
import logger from '../logger';
import { GEMINI_MODEL } from '../services/gemini';

export interface RateLimit {
  rpm: number;
  rpd: number;
}

interface RateLimitConfig {
  default: RateLimit;
  models: Record<string, RateLimit>;
  fallback?: string[];
}

const FALLBACK: RateLimitConfig = {
  default: { rpm: 5, rpd: 20 },
  models: {},
};

// dist/config/rateLimits.js → /app/config/rate-limits.json
const CONFIG_PATH = process.env.RATE_LIMITS_PATH ?? path.join(__dirname, '../../config/rate-limits.json');

let cached: RateLimitConfig | null = null;

function load(): RateLimitConfig {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as RateLimitConfig;
  } catch (err) {
    logger.warn({ err, path: CONFIG_PATH }, 'rate-limits config unreadable, using fallback');
    cached = FALLBACK;
  }
  // Drop chain entries with no `models` config: an unknown model ID returns a
  // non-retryable 4xx, which would fail every job (the chain is walked for all
  // of them). Validate once at load so a typo degrades instead of breaking.
  if (cached.fallback) {
    const known = cached.fallback.filter((m) => m in cached!.models);
    const dropped = cached.fallback.filter((m) => !(m in cached!.models));
    if (dropped.length > 0) {
      logger.warn({ dropped }, 'fallback chain has unknown models (no config.models entry), dropping them');
    }
    cached.fallback = known;
  }
  return cached;
}

export function getRateLimit(model: string): RateLimit {
  const cfg = load();
  return cfg.models[model] ?? cfg.default;
}

// Ordered model chain the worker walks for every job. Falls back to the Gemini
// default model when no chain is configured.
export function getFallbackChain(): string[] {
  const chain = load().fallback;
  return chain && chain.length > 0 ? chain : [GEMINI_MODEL];
}
