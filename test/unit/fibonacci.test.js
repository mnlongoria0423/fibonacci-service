import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FibonacciSequence } from '../../src/fibonacci.js';

describe('FibonacciSequence', () => {
  const seq = () => new FibonacciSequence({ maxN: 10_000 });

  it('returns the example from the specification', () => {
    assert.deepEqual(seq().first(5), [0n, 1n, 1n, 2n, 3n]);
  });

  it('handles the edge cases n = 0, 1, 2', () => {
    assert.deepEqual(seq().first(0), []);
    assert.deepEqual(seq().first(1), [0n]);
    assert.deepEqual(seq().first(2), [0n, 1n]);
  });

  it('satisfies F(i) = F(i-1) + F(i-2) for every element', () => {
    const values = seq().first(500);
    assert.equal(values.length, 500);
    for (let i = 2; i < values.length; i++) {
      assert.equal(values[i], values[i - 1] + values[i - 2], `mismatch at index ${i}`);
    }
  });

  it('stays exact beyond Number.MAX_SAFE_INTEGER', () => {
    const values = seq().first(101);
    // Known reference values.
    assert.equal(values[78], 8944394323791464n); // last value < 2^53
    assert.equal(values[79], 14472334024676221n); // first value > 2^53
    assert.equal(values[100], 354224848179261915075n);
  });

  it('computes large n using known digit count', () => {
    const values = seq().first(10_000);
    // F(9999) has 2090 decimal digits.
    assert.equal(values[9999].toString().length, 2090);
  });

  it('returns independent copies so callers cannot corrupt the cache', () => {
    const s = seq();
    const a = s.first(5);
    a[4] = 999n;
    a.push(42n);
    assert.deepEqual(s.first(6), [0n, 1n, 1n, 2n, 3n, 5n]);
  });

  it('serves shorter requests after longer ones from the cache', () => {
    const s = seq();
    s.first(100);
    assert.deepEqual(s.first(3), [0n, 1n, 1n]);
  });

  it('rejects negative n', () => {
    assert.throws(() => seq().first(-1), RangeError);
  });

  it('rejects n above the configured maximum', () => {
    const s = new FibonacciSequence({ maxN: 10 });
    assert.deepEqual(s.first(10).length, 10);
    assert.throws(() => s.first(11), /at most 10/);
  });

  it('rejects non-integers', () => {
    for (const bad of [1.5, NaN, Infinity, '5', null, undefined, 2 ** 60]) {
      assert.throws(() => seq().first(bad), TypeError, `expected TypeError for ${bad}`);
    }
  });

  it('validates its own construction', () => {
    assert.throws(() => new FibonacciSequence({ maxN: -1 }), RangeError);
    assert.throws(() => new FibonacciSequence({ maxN: 1.5 }), RangeError);
  });
});
