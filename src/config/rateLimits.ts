import * as fs from 'fs';
import * as path from 'path';
import logger from '../logger';

export interface RateLimit {
  rpm: number;
  rpd: number;
}

interface RateLimitConfig {
  default: RateLimit;
  models: Record<string, RateLimit>;
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
  return cached;
}

export function getRateLimit(model: string): RateLimit {
  const cfg = load();
  return cfg.models[model] ?? cfg.default;
}

// The configured model IDs, in config order. Used to populate the UI model picker.
export function listModels(): string[] {
  return Object.keys(load().models);
}
