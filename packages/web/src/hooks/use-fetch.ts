"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

export interface FetchState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

export type FetchAction<T> =
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "error"; error: Error };

export function fetchReducer<T>(state: FetchState<T>, action: FetchAction<T>): FetchState<T> {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "success":
      return { data: action.data, loading: false, error: null };
    case "error":
      return { ...state, loading: false, error: action.error };
  }
}

export interface UseFetchOptions<T> {
  onError?: (err: unknown) => void;
  initialData?: T;
  /** Pre-flight hint: start in the loading state. Use when caller auto-fires run() on mount. */
  initialLoading?: boolean;
}

export interface UseFetchResult<T, A extends unknown[] = unknown[]> extends FetchState<T> {
  run: (...args: A) => Promise<T | undefined>;
  refetch: () => Promise<T | undefined>;
}

export function useFetch<T, A extends unknown[] = []>(
  fn: (...args: A) => Promise<T>,
  opts: UseFetchOptions<T> = {},
): UseFetchResult<T, A> {
  const [state, dispatch] = useReducer(fetchReducer<T>, {
    data: opts.initialData,
    loading: opts.initialLoading ?? false,
    error: null,
  });

  const fnRef = useRef(fn);
  const onErrorRef = useRef(opts.onError);
  const lastArgsRef = useRef<A>([] as unknown as A);
  const callIdRef = useRef(0);

  useEffect(() => {
    fnRef.current = fn;
    onErrorRef.current = opts.onError;
  });

  const run = useCallback(async (...args: A): Promise<T | undefined> => {
    const id = ++callIdRef.current;
    lastArgsRef.current = args;
    dispatch({ type: "start" });
    try {
      const data = await fnRef.current(...args);
      if (callIdRef.current !== id) return undefined;
      dispatch({ type: "success", data });
      return data;
    } catch (err) {
      if (callIdRef.current !== id) return undefined;
      const error = err instanceof Error ? err : new Error(String(err));
      dispatch({ type: "error", error });
      onErrorRef.current?.(err);
      return undefined;
    }
  }, []);

  const refetch = useCallback(() => run(...lastArgsRef.current), [run]);

  return { ...state, run, refetch };
}
