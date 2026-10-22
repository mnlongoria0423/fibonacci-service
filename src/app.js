/**
 * HTTP request handling. This module is transport-agnostic in the sense
 * that it only builds a `(req, res)` handler; creating and running the
 * server lives in server.js so the handler can be tested in isolation.
 *
 * Routes:
 *   GET /v1/fibonacci?n=<int>   first n Fibonacci numbers as a JSON array
 *   GET /healthz                liveness  - the process is up
 *   GET /readyz                 readiness - the process should get traffic
 */

import { randomUUID } from 'node:crypto';
import { FibonacciSequence } from './fibonacci.js';
import { stringifyBigIntArray } from './json.js';
import { HttpProblem, problems } from './problem.js';

const JSON_TYPE = 'application/json; charset=utf-8';
const PROBLEM_TYPE = 'application/problem+json; charset=utf-8';

// Accept only a plain base-10 integer, optionally signed. Anything else
// ("1.5", "1e3", "0x10", " 5", "") is rejected rather than coerced, so the
// API never guesses what the client meant.
const INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * @param {{ maxN: number, logger: ReturnType<import('./logger.js').createLogger>, isReady?: () => boolean }} deps
 */
export function createApp({ maxN, logger, isReady = () => true }) {
  const sequence = new FibonacciSequence({ maxN });

  const routes = {
    '/v1/fibonacci': { GET: (ctx) => getFibonacci(ctx, sequence, maxN) },
    '/healthz': { GET: () => ({ status: 200, body: JSON.stringify({ status: 'ok' }) }) },
    '/readyz': {
      GET: () =>
        isReady()
          ? { status: 200, body: JSON.stringify({ status: 'ready' }) }
          : { status: 503, body: JSON.stringify({ status: 'shutting down' }) },
    },
  };

  return function handle(req, res) {
    const started = process.hrtime.bigint();
    const requestId = sanitizeRequestId(req.headers['x-request-id']) ?? randomUUID();
    const url = new URL(req.url ?? '/', 'http://localhost');
    let outcome;

    try {
      const route = routes[url.pathname];
      if (!route) throw problems.notFound(url.pathname);

      // HEAD is served by the GET handler; Node omits the body automatically.
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      const handler = route[method];
      if (!handler) {
        throw problems.methodNotAllowed(req.method, [...Object.keys(route), 'HEAD']);
      }

      outcome = { contentType: JSON_TYPE, headers: {}, ...handler({ url }) };
    } catch (err) {
      const problem = err instanceof HttpProblem ? err : problems.internal();
      if (!(err instanceof HttpProblem)) {
        logger.error('unhandled error', { requestId, err });
      }
      outcome = {
        status: problem.status,
        contentType: PROBLEM_TYPE,
        headers: problem.headers,
        body: JSON.stringify(problem.toJSON(url.pathname)),
      };
    }

    res.writeHead(outcome.status, {
      'Content-Type': outcome.contentType,
      'Content-Length': Buffer.byteLength(outcome.body),
      'Cache-Control': outcome.status === 200 && url.pathname === '/v1/fibonacci'
        ? 'public, max-age=31536000, immutable' // the answer for a given n never changes
        : 'no-store',
      'X-Request-Id': requestId,
      'X-Content-Type-Options': 'nosniff',
      // While draining, tell keep-alive clients to reconnect elsewhere so
      // shutdown isn't held open until the hard timeout.
      ...(isReady() ? {} : { Connection: 'close' }),
      ...outcome.headers,
    });
    res.end(outcome.body);

    logger.info('request', {
      requestId,
      method: req.method,
      path: url.pathname,
      status: outcome.status,
      durationMs: Number(process.hrtime.bigint() - started) / 1e6,
    });
  };
}

function getFibonacci({ url }, sequence, maxN) {
  const values = url.searchParams.getAll('n');
  if (values.length === 0) {
    throw problems.invalidParameter('n', 'Query parameter "n" is required, e.g. /v1/fibonacci?n=5');
  }
  if (values.length > 1) {
    throw problems.invalidParameter('n', 'Query parameter "n" must be given exactly once');
  }

  const raw = values[0];
  if (!INTEGER_PATTERN.test(raw)) {
    throw problems.invalidParameter('n', `"n" must be an integer, got "${truncate(raw, 32)}"`);
  }

  // Compare as BigInt so absurdly long digit strings can't overflow into
  // something that looks valid.
  const n = BigInt(raw);
  if (n < 0n) {
    throw problems.invalidParameter('n', `"n" must be non-negative, got ${truncate(raw, 32)}`);
  }
  if (n > BigInt(maxN)) {
    throw problems.invalidParameter('n', `"n" must be at most ${maxN}, got ${truncate(raw, 32)}`, {
      maximum: maxN,
    });
  }

  return { status: 200, body: stringifyBigIntArray(sequence.first(Number(n))) };
}

function sanitizeRequestId(value) {
  // Echo a caller-supplied ID for tracing, but never reflect arbitrary
  // input into headers or logs.
  return typeof value === 'string' && /^[\w.-]{1,128}$/.test(value) ? value : undefined;
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
