# Phase 3: useFetch Hook

## Goal

Extract `setLoading(true) → try/catch → setLoading(false)` boilerplate from 10+ pages into a single `useFetch` hook. Preserve per-page error handling (toast vs inline vs silent).

## Tasks

- [ ] Create `packages/web/src/hooks/use-fetch.ts`:
  ```ts
  interface UseFetchOptions<T> {
    onError?: (err: unknown) => void;  // page decides UX (toast/inline/silent)
    initialData?: T;
  }
  interface UseFetchResult<T> {
    data: T | undefined;
    loading: boolean;
    error: Error | null;
    run: (...args: unknown[]) => Promise<T | undefined>;  // explicit trigger
    refetch: () => Promise<T | undefined>;                 // re-run with last args
  }
  function useFetch<T>(fn: (...args: any[]) => Promise<T>, opts?: UseFetchOptions<T>): UseFetchResult<T>
  ```
- [ ] Add `packages/web/src/hooks/__tests__/use-fetch.test.ts`:
  - Loading state cycle (false → true → false)
  - Success populates `data`, clears `error`
  - Error populates `error`, calls `onError`, clears `loading`
  - `refetch` re-uses last args
  - `data` retained on subsequent error (don't clobber stale-ok data)
- [ ] Migrate 3 representative pages first (different error UX styles):
  - `app/analytics/page.tsx` — silent error
  - `app/projects/page.tsx` — toast error
  - `app/schedules/page.tsx` — inline error
- [ ] After Sonnet review of those 3, batch migrate remaining: `sessions`, `login`, `review`, `settings/*`
- [ ] Run `bun test` + `bunx tsc --noEmit`

## Acceptance Criteria

- [ ] Hook published at `@/hooks/use-fetch`
- [ ] At minimum 7 pages migrated (10+ identified)
- [ ] No regression: each page's error UX behaves identically before/after (manual smoke required for at least 2 pages)
- [ ] Hook tests cover all 4 state transitions
- [ ] LOC delta: -120 net across web (estimate; recount after migration)

## Files Touched

- `packages/web/src/hooks/use-fetch.ts` — new (~50 LOC)
- `packages/web/src/hooks/__tests__/use-fetch.test.ts` — new (~80 LOC)
- 7-10 page files in `packages/web/src/app/**/page.tsx` — replace boilerplate

## Risks

- **AbortController**: concurrent calls on same hook should cancel previous in-flight. Decide upfront: "yes, abort previous" (default) or "queue" or "ignore second call". Recommend abort-previous as it matches React 19 Suspense intent. Test for it.
- **Stale closure on `run`**: `useCallback` with empty deps will close over initial `fn`. Use `useRef` to hold latest `fn`, OR document that `fn` must be stable (created with `useCallback` by caller).
- **Don't auto-fire** on mount — that's `useEffect` territory and varies per page. `run` is explicit.

## Files NOT Touched (out of scope)

- Server route handlers (Phase 4)
- WebSocket hooks (different lifecycle, separate work)
- TanStack Query usages (different pattern, mature)
