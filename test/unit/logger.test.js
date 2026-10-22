import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../src/logger.js';

function capture(level) {
  const lines = [];
  const logger = createLogger({ level, write: (line) => lines.push(JSON.parse(line)) });
  return { logger, lines };
}

describe('createLogger', () => {
  it('writes one JSON object per entry with standard fields', () => {
    const { logger, lines } = capture('info');
    logger.info('hello', { a: 1 });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].level, 'info');
    assert.equal(lines[0].msg, 'hello');
    assert.equal(lines[0].a, 1);
    assert.ok(!Number.isNaN(Date.parse(lines[0].time)));
  });

  it('filters entries below the configured level', () => {
    const { logger, lines } = capture('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    assert.deepEqual(lines.map((l) => l.level), ['warn', 'error']);
  });

  it('writes nothing when silent', () => {
    const { logger, lines } = capture('silent');
    logger.error('e');
    assert.equal(lines.length, 0);
  });

  it('serialises errors with name, message and stack', () => {
    const { logger, lines } = capture('info');
    logger.error('boom', { err: new TypeError('bad') });
    assert.equal(lines[0].err.name, 'TypeError');
    assert.equal(lines[0].err.message, 'bad');
    assert.match(lines[0].err.stack, /TypeError: bad/);
  });

  it('child loggers inherit and extend base fields', () => {
    const { logger, lines } = capture('info');
    logger.child({ requestId: 'r1' }).info('x');
    assert.equal(lines[0].requestId, 'r1');
  });
});
