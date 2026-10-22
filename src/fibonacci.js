/**
 * Fibonacci domain logic.
 *
 * Values are computed with BigInt because F(79) already exceeds
 * Number.MAX_SAFE_INTEGER; using plain numbers would silently return
 * wrong answers for any n > 79.
 *
 * The sequence is memoised in a single growing array. Every request for
 * n <= cache length is an O(n) slice with no arithmetic; the cache can
 * never grow beyond the configured maximum, so memory is bounded.
 */

export class FibonacciSequence {
  /** @param {{ maxN: number }} options */
  constructor({ maxN }) {
    if (!Number.isSafeInteger(maxN) || maxN < 0) {
      throw new RangeError(`maxN must be a non-negative safe integer, got ${maxN}`);
    }
    this.maxN = maxN;
    /** @type {bigint[]} */
    this.cache = [0n, 1n];
  }

  /**
   * Returns the first `n` Fibonacci numbers, starting from F(0) = 0.
   *
   * @param {number} n
   * @returns {bigint[]}
   */
  first(n) {
    if (!Number.isSafeInteger(n)) {
      throw new TypeError(`n must be an integer, got ${n}`);
    }
    if (n < 0) {
      throw new RangeError(`n must be non-negative, got ${n}`);
    }
    if (n > this.maxN) {
      throw new RangeError(`n must be at most ${this.maxN}, got ${n}`);
    }

    const { cache } = this;
    while (cache.length < n) {
      cache.push(cache[cache.length - 1] + cache[cache.length - 2]);
    }
    return cache.slice(0, n);
  }
}
