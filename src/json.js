/**
 * JSON helpers.
 *
 * JSON.stringify throws on BigInt. Converting to Number would lose
 * precision and converting to string would change the documented response
 * type, so we emit BigInts as bare JSON number literals. This is valid JSON
 * (RFC 8259 places no limit on number size); clients that need exact values
 * beyond 2^53 must use an arbitrary-precision JSON parser, which is
 * documented in the README and the OpenAPI spec.
 */

/**
 * Serialises an array of BigInts as a JSON array of numbers.
 *
 * @param {bigint[]} values
 * @returns {string}
 */
export function stringifyBigIntArray(values) {
  return `[${values.join(',')}]`;
}
