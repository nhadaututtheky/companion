/**
 * Unit tests for the route error helper.
 *
 * Lightweight — exercises `fail(...)` against a real Hono app with an
 * in-memory request, since wiring against a mock `Context` would miss
 * Hono's actual response handling.
 */

import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createFail } from "./error-wrapper.js";
import type { Logger } from "../../logger.js";

interface Captured {
  msg: string;
  data?: Record<string, unknown>;
}

function makeRecordingLogger(): { log: Logger; calls: Captured[] } {
  const calls: Captured[] = [];
  const noop = () => {};
  const record = (msg: string, data?: Record<string, unknown>) => {
    calls.push({ msg, data });
  };
  return {
    log: { debug: noop, info: noop, warn: noop, error: record },
    calls,
  };
}

describe("createFail / fail", () => {
  it("never fires for successful handlers", async () => {
    const { log, calls } = makeRecordingLogger();
    const fail = createFail(log);

    const app = new Hono();
    app.get("/ok", async (c) => {
      try {
        return c.json({ success: true, data: { hello: "world" } });
      } catch (err) {
        return fail("fetch ok", err, c);
      }
    });

    const res = await app.request("/ok");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("returns 500 + generic message + log entry on thrown Error", async () => {
    const { log, calls } = makeRecordingLogger();
    const fail = createFail(log);

    const app = new Hono();
    app.get("/boom", async (c) => {
      try {
        throw new Error("oh no, db is down");
      } catch (err) {
        return fail("create thing", err, c);
      }
    });

    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to create thing");
    // Generic — internal err.message MUST NOT leak by default
    expect(body.error).not.toContain("db is down");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.msg).toBe("Failed to create thing");
    expect(calls[0]?.data?.path).toBe("/boom");
    expect(calls[0]?.data?.method).toBe("GET");
    expect(String(calls[0]?.data?.error)).toContain("db is down");
  });

  it("respects custom status (e.g. 400 for validation failures)", async () => {
    const { log } = makeRecordingLogger();
    const fail = createFail(log);

    const app = new Hono();
    app.post("/validate", async (c) => {
      try {
        throw new Error("missing field");
      } catch (err) {
        return fail("validate input", err, c, { status: 400 });
      }
    });

    const res = await app.request("/validate", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("exposeError=true echoes err.message in the response", async () => {
    const { log } = makeRecordingLogger();
    const fail = createFail(log);

    const app = new Hono();
    app.get("/bad", async (c) => {
      try {
        throw new Error("invalid date format");
      } catch (err) {
        return fail("parse query", err, c, { exposeError: true, status: 422 });
      }
    });

    const res = await app.request("/bad");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.error).toBe("invalid date format");
  });

  it("merges opts.context into the log entry", async () => {
    const { log, calls } = makeRecordingLogger();
    const fail = createFail(log);

    const app = new Hono();
    app.post("/items/:id", async (c) => {
      const id = c.req.param("id");
      try {
        throw new Error("nope");
      } catch (err) {
        return fail("update item", err, c, { context: { itemId: id, op: "patch" } });
      }
    });

    await app.request("/items/abc123", { method: "POST" });
    expect(calls[0]?.data?.itemId).toBe("abc123");
    expect(calls[0]?.data?.op).toBe("patch");
    // Standard fields still present
    expect(calls[0]?.data?.path).toBe("/items/abc123");
  });

  it("non-Error throws (e.g. throw 'oops') still get the generic message", async () => {
    const { log } = makeRecordingLogger();
    const fail = createFail(log);

    const app = new Hono();
    app.get("/string-throw", async (c) => {
      try {
        // eslint-disable-next-line no-throw-literal
        throw "plain string";
      } catch (err) {
        return fail("do thing", err, c);
      }
    });

    const res = await app.request("/string-throw");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    // exposeError defaults false → generic
    expect(body.error).toBe("Failed to do thing");
  });
});
