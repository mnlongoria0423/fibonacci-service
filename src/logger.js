/**
 * Minimal structured (JSON-lines) logger. One object per line on stdout is
 * what every log shipper (CloudWatch, Loki, Datadog, Stackdriver) expects,
 * and avoids pulling in a logging dependency.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: Infinity };

/**
 * @param {{ level?: keyof LEVELS, write?: (line: string) => void, base?: object }} [options]
 */
export function createLogger({ level = 'info', write = (line) => process.stdout.write(line), base = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const log = (lvl, msg, fields) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, msg, ...base, ...fields };
    write(`${JSON.stringify(entry, errorReplacer)}\n`);
  };

  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
    child: (fields) => createLogger({ level, write, base: { ...base, ...fields } }),
  };
}

function errorReplacer(_key, value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}
