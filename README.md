# Fibonacci Service

An HTTP API that returns the first `n` Fibonacci numbers, starting from 0.

```
$ curl 'http://localhost:8080/v1/fibonacci?n=5'
[0,1,1,2,3]
```

The problem is trivial, so the code is written as if this service had to run
in production and be maintained for five years: zero runtime dependencies,
exact arithmetic, bounded resource use, structured logs, health probes,
graceful shutdown, a documented error contract, and tests that cover both
the units and the running server.

## Quick start

Requires **Node.js 20 or newer**. There is nothing to install: the service
uses only the Node standard library.

```bash
npm start                 # listens on http://0.0.0.0:8080
npm test                  # unit + integration tests
npm run test:coverage     # with a coverage report
```

### Docker

```bash
docker build -t fibonacci-service .
docker run --rm -p 8080:8080 fibonacci-service
```

The image runs as a non-root user, has a `HEALTHCHECK`, and runs Node as
PID 1 so `docker stop` / Kubernetes `SIGTERM` triggers a graceful shutdown.

### Kubernetes (outline)

Point the liveness probe at `/healthz` and the readiness probe at `/readyz`.
On `SIGTERM` the service immediately reports not-ready, finishes in-flight
requests, and exits; set `terminationGracePeriodSeconds` above
`SHUTDOWN_TIMEOUT_MS`.

## API

Full contract: [`docs/openapi.yaml`](docs/openapi.yaml).

### `GET /v1/fibonacci?n=<integer>`

| Request                        | Status | Body                                  |
| ------------------------------ | ------ | ------------------------------------- |
| `?n=5`                         | 200    | `[0,1,1,2,3]`                         |
| `?n=0`                         | 200    | `[]`                                  |
| `?n=-1`                        | 400    | problem document: must be non-negative |
| `?n=abc`, `?n=1.5`, `?n=1e3`   | 400    | problem document: must be an integer   |
| `?n=10001` (above the maximum) | 400    | problem document, includes `maximum`  |
| no `n`, or `n` given twice     | 400    | problem document                      |
| `POST`, `PUT`, ...             | 405    | problem document, `Allow: GET, HEAD`  |

Errors use [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)
(`application/problem+json`), so every error has the same machine-readable
shape:

```json
{
  "type": "/problems/invalid-parameter",
  "title": "Invalid parameter",
  "status": 400,
  "detail": "\"n\" must be non-negative, got -1",
  "instance": "/v1/fibonacci",
  "parameter": "n"
}
```

### `GET /healthz`, `GET /readyz`

Liveness and readiness probes. `/readyz` returns 503 while draining for
shutdown.

Every response carries an `X-Request-Id` header (the caller's, if it is
well-formed, otherwise a new UUID), which is also written to the request log.

## Configuration

All configuration comes from environment variables. Invalid values stop the
process at startup with exit code 78 and a clear message, so a bad deploy
fails immediately instead of misbehaving later.

| Variable              | Default   | Description                                  |
| --------------------- | --------- | -------------------------------------------- |
| `HOST`                | `0.0.0.0` | Interface to bind                            |
| `PORT`                | `8080`    | Port to listen on (`0` = random)             |
| `FIB_MAX_N`           | `10000`   | Largest `n` accepted (hard ceiling 1000000)  |
| `LOG_LEVEL`           | `info`    | `debug`, `info`, `warn`, `error`, `silent`   |
| `REQUEST_TIMEOUT_MS`  | `30000`   | Max time to receive a full request           |
| `SHUTDOWN_TIMEOUT_MS` | `10000`   | Max time to drain connections on shutdown    |

## Design decisions

**Exact arithmetic with BigInt.** F(79) is the first value above
`Number.MAX_SAFE_INTEGER`. A `Number`-based implementation silently returns
wrong values from there on, which is the worst kind of bug. All values are
`BigInt`.

**Large values are JSON numbers, not strings.** The spec asks for
`[0, 1, 1, 2, 3]`, so the response is a JSON array of numbers at every size.
JSON places no limit on number size, so values like `354224848179261915075`
are valid. Clients that need exact values above 2^53 must use an
arbitrary-precision parser (for example `json-bigint` in JavaScript; Python's
`json` module already handles them). This is documented in the OpenAPI spec.
If a client can't do that, the fix is a versioned addition (for example
`?format=string`), not a breaking change.

**Bounded work per request.** `n` is capped (`FIB_MAX_N`, default 10,000;
the response at the cap is about 10 MB). Without a cap, a single request for
`n=10000000` could tie up the CPU and memory, which is a denial-of-service
risk. The cap is checked by comparing BigInts, so a 400-digit `n` cannot
overflow into a value that passes validation, and error messages truncate
the echoed input.

**Memoised sequence.** Computed values are cached in one array that can
never grow past `FIB_MAX_N`. Repeat requests skip the arithmetic, and
callers get a copy so they cannot corrupt the cache. Successful responses
are also marked `Cache-Control: immutable`, since the answer for a given `n`
never changes, so CDNs and clients can cache them too.

**Strict input parsing.** Only plain base-10 integers are accepted. `1.5`,
`1e3`, `0x10` and `" 5"` are rejected rather than silently coerced, so the
API never guesses what the client meant.

**Versioned path.** `/v1/` leaves room to evolve the contract without
breaking existing clients over a five-year lifetime.

**Zero dependencies.** No supply-chain exposure, no dependency upgrades to
chase, and nothing to audit except this repository. CI tests every supported
Node LTS so runtime upgrades are caught early.

## Project layout

```
src/
  index.js       process entry point: config, signals
  server.js      HTTP server lifecycle and graceful shutdown
  app.js         routing, validation, response formatting
  fibonacci.js   domain logic (pure, no HTTP)
  problem.js     RFC 9457 error types
  config.js      env-var parsing with fail-fast validation
  logger.js      JSON-lines structured logger
  json.js        BigInt-safe serialisation
test/
  unit/          pure-function tests
  integration/   tests against a real server over HTTP
docs/openapi.yaml
Dockerfile
.github/workflows/ci.yml   tests on Node 20/22/24, builds and smoke-tests the image
```

## Possible extensions

- Prometheus `/metrics` (request counts and latency histograms).
- Streaming responses, if the cap ever needs to go much higher.
- Rate limiting, usually best handled at the gateway or ingress.
