/**
 * Integration tests: start a real HTTP server on an ephemeral port and
 * exercise it over the network with fetch, exactly as a client would.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../src/app.js';
import { startServer } from '../../src/server.js';
import { createLogger } from '../../src/logger.js';

const MAX_N = 1000;
let instance;
let baseUrl;

before(async () => {
  instance = await startServer(
    { host: '127.0.0.1', port: 0, maxN: MAX_N, shutdownTimeoutMs: 1000, requestTimeoutMs: 5000 },
    createLogger({ level: 'silent' }),
  );
  baseUrl = `http://127.0.0.1:${instance.port}`;
});

after(() => instance.close());

const get = (path, init) => fetch(`${baseUrl}${path}`, init);

async function expectProblem(res, status) {
  assert.equal(res.status, status);
  assert.match(res.headers.get('content-type'), /^application\/problem\+json/);
  const body = await res.json();
  assert.equal(body.status, status);
  assert.equal(typeof body.title, 'string');
  assert.equal(typeof body.detail, 'string');
  return body;
}

describe('GET /v1/fibonacci', () => {
  it('returns the first n Fibonacci numbers (spec example n=5)', async () => {
    const res = await get('/v1/fibonacci?n=5');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await res.json(), [0, 1, 1, 2, 3]);
  });

  it('returns an empty array for n=0', async () => {
    const res = await get('/v1/fibonacci?n=0');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it('returns exact large values as JSON numbers', async () => {
    const res = await get('/v1/fibonacci?n=101');
    const text = await res.text();
    assert.ok(text.endsWith(',218922995834555169026,354224848179261915075]'));
  });

  it('accepts n equal to the configured maximum', async () => {
    const res = await get(`/v1/fibonacci?n=${MAX_N}`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text.split(',').length, MAX_N);
  });

  it('accepts an explicit plus sign and leading zeros', async () => {
    assert.deepEqual(await (await get('/v1/fibonacci?n=%2B3')).json(), [0, 1, 1]);
    assert.deepEqual(await (await get('/v1/fibonacci?n=003')).json(), [0, 1, 1]);
  });

  it('marks successful responses as cacheable', async () => {
    const res = await get('/v1/fibonacci?n=5');
    assert.match(res.headers.get('cache-control'), /max-age=\d+/);
  });

  it('rejects a negative n with 400 and a problem document', async () => {
    const body = await expectProblem(await get('/v1/fibonacci?n=-1'), 400);
    assert.equal(body.parameter, 'n');
    assert.match(body.detail, /non-negative/);
  });

  it('rejects a hugely negative n without overflow', async () => {
    const body = await expectProblem(await get(`/v1/fibonacci?n=-${'9'.repeat(400)}`), 400);
    assert.match(body.detail, /non-negative/);
    assert.ok(body.detail.length < 200, 'detail should not echo unbounded input');
  });

  it('rejects n above the maximum and reports the limit', async () => {
    const body = await expectProblem(await get(`/v1/fibonacci?n=${MAX_N + 1}`), 400);
    assert.equal(body.maximum, MAX_N);
  });

  it('rejects an n too large to be a safe integer', async () => {
    await expectProblem(await get(`/v1/fibonacci?n=${'9'.repeat(30)}`), 400);
  });

  for (const bad of ['abc', '1.5', '1e3', '0x10', '', '%205', '5abc', 'NaN', 'Infinity']) {
    it(`rejects non-integer n=${JSON.stringify(bad)}`, async () => {
      const body = await expectProblem(await get(`/v1/fibonacci?n=${bad}`), 400);
      assert.match(body.detail, /integer/);
    });
  }

  it('rejects a missing n', async () => {
    const body = await expectProblem(await get('/v1/fibonacci'), 400);
    assert.match(body.detail, /required/);
  });

  it('rejects a repeated n', async () => {
    const body = await expectProblem(await get('/v1/fibonacci?n=1&n=2'), 400);
    assert.match(body.detail, /exactly once/);
  });

  it('responds to HEAD with headers but no body', async () => {
    const res = await get('/v1/fibonacci?n=5', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-length'), '11');
    assert.equal(await res.text(), '');
  });

  it('rejects other methods with 405 and an Allow header', async () => {
    const res = await get('/v1/fibonacci?n=5', { method: 'POST' });
    await expectProblem(res, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  });
});

describe('cross-cutting behaviour', () => {
  it('returns 404 problem documents for unknown routes', async () => {
    const body = await expectProblem(await get('/nope'), 404);
    assert.equal(body.instance, '/nope');
  });

  it('generates a request id when none is supplied', async () => {
    const res = await get('/healthz');
    assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  });

  it('propagates a well-formed caller request id', async () => {
    const res = await get('/healthz', { headers: { 'X-Request-Id': 'trace-123' } });
    assert.equal(res.headers.get('x-request-id'), 'trace-123');
  });

  it('does not reflect a malformed caller request id', async () => {
    const res = await get('/healthz', { headers: { 'X-Request-Id': 'bad id <script>' } });
    assert.notEqual(res.headers.get('x-request-id'), 'bad id <script>');
  });

  it('sets nosniff on every response', async () => {
    for (const path of ['/healthz', '/v1/fibonacci?n=1', '/nope']) {
      assert.equal((await get(path)).headers.get('x-content-type-options'), 'nosniff');
    }
  });

  it('handles concurrent requests consistently', async () => {
    const ns = Array.from({ length: 50 }, (_, i) => (i * 37) % MAX_N);
    const results = await Promise.all(ns.map((n) => get(`/v1/fibonacci?n=${n}`).then((r) => r.text())));
    results.forEach((text, i) => {
      assert.equal(text === '[]' ? 0 : text.split(',').length, ns[i]);
    });
  });
});

describe('health endpoints', () => {
  it('GET /healthz reports ok', async () => {
    const res = await get('/healthz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  it('GET /readyz reports ready', async () => {
    const res = await get('/readyz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ready' });
  });
});

describe('graceful shutdown', () => {
  const startOther = () =>
    startServer(
      { host: '127.0.0.1', port: 0, maxN: 10, shutdownTimeoutMs: 1000, requestTimeoutMs: 5000 },
      createLogger({ level: 'silent' }),
    );

  it('lets an in-flight request finish, then refuses new connections', async () => {
    const other = await startOther();
    const url = `http://127.0.0.1:${other.port}`;

    // Open a request and start shutdown before reading the response.
    const inFlight = new Promise((resolve, reject) => {
      const req = http.get(`${url}/readyz`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('socket', (socket) => socket.on('connect', () => other.close()));
    });

    const { status } = await inFlight;
    // Depending on timing the request either completed normally or saw the
    // not-ready flag; either way it was answered rather than dropped.
    assert.ok(status === 200 || status === 503, `unexpected status ${status}`);

    await other.close(); // idempotent: returns the same pending promise
    await assert.rejects(fetch(`${url}/healthz`));
  });

  it('reports 503 on /readyz when not ready, while /healthz stays 200', async () => {
    const server = http.createServer(
      createApp({ maxN: 10, logger: createLogger({ level: 'silent' }), isReady: () => false }),
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      const ready = await fetch(`${url}/readyz`);
      assert.equal(ready.status, 503);
      assert.deepEqual(await ready.json(), { status: 'shutting down' });
      assert.equal((await fetch(`${url}/healthz`)).status, 200);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
