# Phase 4: Hono Route Error Wrapper

## Goal

Replace `try { handler } catch (err) { log.error + c.json({ success: false, error }, 500) }` boilerplate (16+ occurrences in `routes/channels.ts` alone) with a single `withErrorHandler` middleware or wrapper.

## Tasks

- [ ] Create `packages/server/src/routes/_middleware/error-wrapper.ts`:
  ```ts
  // Hono-style: wraps a handler, catches uncaught errors, formats response,
  // preserves all log fields (request id, user id, route name).
  type AsyncHandler<E extends Env = Env> = (c: Context<E>) => Promise<Response>;
  export function withErrorHandler<E extends Env>(
    routeName: string,
    handler: AsyncHandler<E>,
  ): AsyncHandler<E>
  ```
- [ ] Decide on response shape — match existing convention `{ success: false, error: string, code?: string }`. Audit 5 catch blocks first to confirm exact shape.
- [ ] Add `packages/server/src/routes/_middleware/__tests__/error-wrapper.test.ts`:
  - Wrapped handler returns success unchanged
  - Thrown Error → 500 + correct JSON shape + log entry
  - Custom `HTTPError` (if codebase has one) → respect status code
  - Logger called with `{ route, requestId, error.message, error.stack }`
- [ ] Migrate `packages/server/src/routes/channels.ts` first (highest density: 16 occurrences)
- [ ] Migrate `packages/server/src/routes/sessions.ts`, `routes/codegraph.ts`, `routes/wiki.ts`
- [ ] Run `bun test` (server-side test if exists) + `bunx tsc --noEmit`
- [ ] Manual smoke: hit 1 endpoint per migrated route, force an error (eg. invalid id), verify response shape unchanged

## Acceptance Criteria

- [ ] No `try/catch` blocks in route handlers that ONLY do log + 500. Domain-specific catches (eg. retry, fallback) stay.
- [ ] Wrapper preserves logger context (request id especially)
- [ ] Response shape unchanged for clients
- [ ] At least 4 route files migrated
- [ ] LOC delta: -100 net across server

## Files Touched

- `packages/server/src/routes/_middleware/error-wrapper.ts` — new (~40 LOC)
- `packages/server/src/routes/_middleware/__tests__/error-wrapper.test.ts` — new (~80 LOC)
- `packages/server/src/routes/channels.ts` — drop 16 try/catch blocks
- `packages/server/src/routes/sessions.ts` — same treatment
- `packages/server/src/routes/codegraph.ts` — same
- `packages/server/src/routes/wiki.ts` — same

## Risks

- **Custom error types**: if codebase throws `HTTPError(404, "...")`, wrapper must respect `.status`. Audit `throw` statements before designing the wrapper.
- **Logger context**: existing handlers may add custom fields (`{ sessionId, channelId }`). Wrapper should ACCEPT a `logContext` param OR caller wraps its own try with explicit log + rethrow for context-rich cases.
- **Streaming responses**: handlers that return SSE/stream should NOT be wrapped (wrapper assumes JSON response). Document and skip.

## Implementation Notes

- Look at existing log helper (`packages/server/src/utils/logger.ts` or similar) — match its API
- Hono v4 has `app.onError` global handler — consider using that instead of per-route wrapper if codebase doesn't already have one. Single global handler may be cleaner than 4 file migrations.
- Decision point: **per-route wrapper** vs **`app.onError`** global. Recommend trying global first (zero per-handler change), falling back to wrapper if global lacks per-route context.

## Files NOT Touched

- WebSocket handlers (separate error semantics)
- Background jobs / queue workers (different log surface)
