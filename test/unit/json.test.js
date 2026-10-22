import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stringifyBigIntArray } from '../../src/json.js';

describe('stringifyBigIntArray', () => {
  it('produces a JSON array of numbers', () => {
    const json = stringifyBigIntArray([0n, 1n, 1n, 2n, 3n]);
    assert.equal(json, '[0,1,1,2,3]');
    assert.deepEqual(JSON.parse(json), [0, 1, 1, 2, 3]);
  });

  it('handles an empty array', () => {
    assert.equal(stringifyBigIntArray([]), '[]');
  });

  it('preserves every digit of large values', () => {
    const big = 354224848179261915075n;
    assert.equal(stringifyBigIntArray([big]), '[354224848179261915075]');
  });
});
