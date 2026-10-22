/**
 * Errors are returned as RFC 9457 "Problem Details" documents
 * (application/problem+json), so clients get a stable, machine-readable
 * shape across every error the service can produce.
 */

export class HttpProblem extends Error {
  /**
   * @param {number} status
   * @param {string} title   Short, stable summary for this class of problem.
   * @param {string} detail  Human-readable explanation of this occurrence.
   * @param {{ type?: string, headers?: Record<string, string>, extensions?: object }} [options]
   */
  constructor(status, title, detail, { type = 'about:blank', headers = {}, extensions = {} } = {}) {
    super(detail);
    this.name = 'HttpProblem';
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.type = type;
    this.headers = headers;
    this.extensions = extensions;
  }

  /** @param {string} [instance] */
  toJSON(instance) {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      ...(instance ? { instance } : {}),
      ...this.extensions,
    };
  }
}

export const problems = {
  invalidParameter: (name, detail, extensions = {}) =>
    new HttpProblem(400, 'Invalid parameter', detail, {
      type: '/problems/invalid-parameter',
      extensions: { parameter: name, ...extensions },
    }),
  notFound: (path) => new HttpProblem(404, 'Not Found', `No route matches ${path}`),
  methodNotAllowed: (method, allowed) =>
    new HttpProblem(405, 'Method Not Allowed', `Method ${method} is not supported for this resource`, {
      headers: { Allow: allowed.join(', ') },
    }),
  internal: () => new HttpProblem(500, 'Internal Server Error', 'An unexpected error occurred'),
};
