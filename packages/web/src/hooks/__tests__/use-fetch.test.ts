/**
 * Tests for the `useFetch` reducer. The hook itself is a thin wrapper over
 * this pure reducer + a stale-call guard; state-transition correctness is
 * verified here without pulling in a DOM/testing-library dependency.
 */
import { describe, it, expect } from "bun:test";
import { fetchReducer, type FetchState } from "../use-fetch";

const INITIAL: FetchState<number> = { data: undefined, loading: false, error: null };

describe("fetchReducer — state transitions", () => {
  it("start: flips loading true and clears any prior error", () => {
    const prior: FetchState<number> = { data: 42, loading: false, error: new Error("stale") };
    const next = fetchReducer(prior, { type: "start" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
    expect(next.data).toBe(42); // data retained on start so UI can keep showing prior value
  });

  it("success: sets data, clears loading and error", () => {
    const loading: FetchState<number> = { data: undefined, loading: true, error: null };
    const next = fetchReducer(loading, { type: "success", data: 7 });
    expect(next).toEqual({ data: 7, loading: false, error: null });
  });

  it("success overwrites stale data", () => {
    const loading: FetchState<number> = { data: 1, loading: true, error: null };
    const next = fetchReducer(loading, { type: "success", data: 2 });
    expect(next.data).toBe(2);
  });

  it("error: sets error, clears loading, retains prior data (don't clobber last-good)", () => {
    const loading: FetchState<number> = { data: 5, loading: true, error: null };
    const err = new Error("boom");
    const next = fetchReducer(loading, { type: "error", error: err });
    expect(next.loading).toBe(false);
    expect(next.error).toBe(err);
    expect(next.data).toBe(5);
  });

  it("full cycle: initial → start → success", () => {
    const s1 = fetchReducer(INITIAL, { type: "start" });
    const s2 = fetchReducer(s1, { type: "success", data: 1 });
    expect(s1.loading).toBe(true);
    expect(s2.loading).toBe(false);
    expect(s2.data).toBe(1);
    expect(s2.error).toBeNull();
  });

  it("full cycle: initial → start → error", () => {
    const s1 = fetchReducer(INITIAL, { type: "start" });
    const err = new Error("fail");
    const s2 = fetchReducer(s1, { type: "error", error: err });
    expect(s2.loading).toBe(false);
    expect(s2.error).toBe(err);
    expect(s2.data).toBeUndefined();
  });
});
