/**
 * Configuration is read once at startup from environment variables
 * (12-factor style). Invalid values fail fast with a clear message rather
 * than letting the service start in a half-configured state.
 */

const DEFAULTS = Object.freeze({
  host: '0.0.0.0',
  port: 8080,
  // F(10000) has ~2090 digits; the full response is ~10 MB. This keeps
  // worst-case CPU, memory and bandwidth per request bounded.
  maxN: 10_000,
  logLevel: 'info',
  shutdownTimeoutMs: 10_000,
  requestTimeoutMs: 30_000,
});

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'];

export class ConfigError extends Error {}

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function loadConfig(env = process.env) {
  return Object.freeze({
    host: env.HOST || DEFAULTS.host,
    port: parseInteger(env, 'PORT', DEFAULTS.port, { min: 0, max: 65_535 }),
    maxN: parseInteger(env, 'FIB_MAX_N', DEFAULTS.maxN, { min: 0, max: 1_000_000 }),
    logLevel: parseEnum(env, 'LOG_LEVEL', DEFAULTS.logLevel, LOG_LEVELS),
    shutdownTimeoutMs: parseInteger(env, 'SHUTDOWN_TIMEOUT_MS', DEFAULTS.shutdownTimeoutMs, { min: 0 }),
    requestTimeoutMs: parseInteger(env, 'REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs, { min: 1 }),
  });
}

function parseInteger(env, name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new ConfigError(`${name} must be an integer, got "${raw}"`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}, got ${raw}`);
  }
  return value;
}

function parseEnum(env, name, fallback, allowed) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (!allowed.includes(value)) {
    throw new ConfigError(`${name} must be one of ${allowed.join(', ')}, got "${raw}"`);
  }
  return value;
}
