import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('uses sensible defaults with an empty environment', () => {
    const config = loadConfig({});
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 8080);
    assert.equal(config.maxN, 10_000);
    assert.equal(config.logLevel, 'info');
  });

  it('reads values from the environment', () => {
    const config = loadConfig({ HOST: '127.0.0.1', PORT: '3000', FIB_MAX_N: '50', LOG_LEVEL: 'DEBUG' });
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 3000);
    assert.equal(config.maxN, 50);
    assert.equal(config.logLevel, 'debug');
  });

  it('treats empty strings as unset', () => {
    assert.equal(loadConfig({ PORT: '' }).port, 8080);
  });

  it('is immutable', () => {
    assert.ok(Object.isFrozen(loadConfig({})));
  });

  for (const [name, value] of [
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['PORT', '80.5'],
    ['FIB_MAX_N', '-1'],
    ['FIB_MAX_N', '99999999'],
    ['LOG_LEVEL', 'verbose'],
    ['REQUEST_TIMEOUT_MS', '0'],
  ]) {
    it(`fails fast on invalid ${name}=${value}`, () => {
      assert.throws(() => loadConfig({ [name]: value }), (err) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, new RegExp(name));
        return true;
      });
    });
  }
});
