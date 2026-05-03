/**
 * Route handler error helper.
 *
 * Reduces the `log.error(...) + c.json({ success: false, error: ... }, 500)`
 * tail of every catch block to one line. We do NOT wrap the handler — Hono's
 * chain inference (`zValidator` augmenting `c.req.valid()`) breaks when the
 * handler's `Context` type is hidden behind a generic boundary, so handlers
 * keep their `try/catch` shape and only the catch body collapses.
 *
 * Usage:
 * ```ts
 * const log = createLogger("routes:channels");
 * const fail = createFail(log);
 *
 * router.post("/", zValidator("json", schema), async (c) => {
 *   try {
 *     const body = c.req.valid("json");
 *     const ch = createChannel(body);
 *     return c.json({ success: true, data: ch }, 201);
 *   } catch (err) {
 *     return fail("create channel", err, c);
 *   }
 * });
 * ```
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "../../logger.js";

export interface FailOpts {
  /**
   * HTTP status returned to the client. Default 500.
   * Use 400/422 for validation-style failures.
   */
  status?: ContentfulStatusCode;
  /**
   * When true, include `err.message` in the response payload instead of the
   * generic "Failed to {action}". Use ONLY for user-actionable validation
   * errors — never for internal failures (could leak stack traces, paths,
   * SQL fragments, etc).
   */
  exposeError?: boolean;
  /**
   * Extra context passed to `log.error`. Merged into the standard
   * `{ path, method, error }` payload — caller can add ids etc.
   */
  context?: Record<string, unknown>;
}

/**
 * Bind the helper to a route-tagged logger. Each route file calls this once
 * at the top so every catch keeps a consistent log tag.
 */
export function createFail(log: Logger) {
  // biome-ignore lint/suspicious/noExplicitAny: Hono Context with chain inference
  return function fail(action: string, err: unknown, c: Context<any, any, any>, opts: FailOpts = {}) {
    log.error(`Failed to ${action}`, {
      path: c.req.path,
      method: c.req.method,
      error: String(err),
      ...opts.context,
    });
    const message =
      opts.exposeError && err instanceof Error ? err.message : `Failed to ${action}`;
    return c.json(
      { success: false, error: message },
      (opts.status ?? 500) as ContentfulStatusCode,
    );
  };
}
