/**
 * Gemini CLI smoke test.
 *
 * Covers: detect, registry wiring, parseGeminiMessage unit tests, end-to-end launch.
 *
 * Auth: if GEMINI_API_KEY is set and valid, runs a real round-trip against the API.
 * Otherwise verifies that:
 *   - process still spawns
 *   - non-JSON stdout noise is filtered into stderr, not message stream
 *   - auth error is captured in stderr buffer for UI surface
 *
 * Run: bun run packages/server/scripts/test-gemini-smoke.ts
 */

import { GeminiAdapter, parseGeminiMessage } from "../src/services/adapters/gemini-adapter.js";
import { getAdapter, detectAllPlatforms } from "../src/services/adapters/adapter-registry.js";
import type { NormalizedMessage } from "@companion/shared";

const PASS = "\x1b[32mPASS\x1b[0m";
const FAIL = "\x1b[31mFAIL\x1b[0m";
const SKIP = "\x1b[33mSKIP\x1b[0m";
const INFO = "\x1b[36mINFO\x1b[0m";

let failures = 0;
let passed = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? PASS : FAIL}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failures++;
}

function skip(label: string, reason: string): void {
  console.log(`${SKIP}  ${label} — ${reason}`);
}

async function main(): Promise<void> {
  console.log(`${INFO}  Gemini CLI smoke test\n`);

  // ── 1. Detection ────────────────────────────────────────────────────────
  console.log("─── 1. Detection ───");
  const adapter = new GeminiAdapter();
  const det = await adapter.detect();
  check("detect() returned an object", typeof det === "object");
  check(
    "gemini CLI available",
    det.available === true,
    det.available ? `v${det.version}` : "not installed",
  );
  if (!det.available) {
    console.log(`\n${FAIL}  Gemini CLI missing. Install: npm i -g @google/gemini-cli`);
    process.exit(1);
  }

  // ── 2. Registry wiring ──────────────────────────────────────────────────
  console.log("\n─── 2. Registry wiring ───");
  const fromRegistry = getAdapter("gemini");
  check("getAdapter('gemini') returns GeminiAdapter", fromRegistry.platform === "gemini");
  check("capabilities.outputFormat = ndjson", fromRegistry.capabilities.outputFormat === "ndjson");
  check(
    "capabilities.supportsInteractive = false (one-shot mode)",
    fromRegistry.capabilities.supportsInteractive === false,
  );
  check(
    "capabilities.supportsResume = false (index-based, not ID)",
    fromRegistry.capabilities.supportsResume === false,
  );
  check("capabilities.supportsStreaming", fromRegistry.capabilities.supportsStreaming === true);

  const all = await detectAllPlatforms();
  const geminiEntry = all.find((a) => a.platform === "gemini");
  check(
    "gemini present in detectAllPlatforms()",
    !!geminiEntry && geminiEntry.detection.available === true,
  );

  // ── 3. Unit tests for parseGeminiMessage ───────────────────────────────
  console.log("\n─── 3. parseGeminiMessage unit tests ───");

  // init
  const initMsg = parseGeminiMessage(
    JSON.stringify({
      type: "init",
      timestamp: "2026-04-17T07:36:56Z",
      session_id: "abc-123",
      model: "gemini-2.0-pro",
    }),
  );
  check("init → system_init", initMsg?.type === "system_init");
  check("init.sessionId extracted", initMsg?.sessionId === "abc-123");
  check("init.model extracted", initMsg?.model === "gemini-2.0-pro");

  // assistant message
  const assistantMsg = parseGeminiMessage(
    JSON.stringify({ type: "message", role: "assistant", content: "Hello world" }),
  );
  check("message(assistant) → assistant", assistantMsg?.type === "assistant");
  check("message(assistant).content extracted", assistantMsg?.content === "Hello world");
  check(
    "message(assistant).contentBlocks populated",
    assistantMsg?.contentBlocks?.[0]?.type === "text",
  );

  // user echo → progress (filtered from content stream)
  const userEcho = parseGeminiMessage(
    JSON.stringify({ type: "message", role: "user", content: "test" }),
  );
  check("message(user) → progress (not surfaced as content)", userEcho?.type === "progress");

  // tool_use
  const toolUse = parseGeminiMessage(
    JSON.stringify({
      type: "tool_use",
      tool_name: "read_file",
      tool_id: "t1",
      parameters: { path: "a.txt" },
    }),
  );
  check("tool_use → assistant block", toolUse?.type === "assistant");
  const toolBlock = toolUse?.contentBlocks?.[0];
  check("tool_use block name", toolBlock?.type === "tool_use" && toolBlock.name === "read_file");
  check("tool_use block id", toolBlock?.type === "tool_use" && toolBlock.id === "t1");
  check(
    "tool_use parameters mapped to input",
    toolBlock?.type === "tool_use" && (toolBlock.input as { path?: string }).path === "a.txt",
  );

  // tool_result success
  const toolResOk = parseGeminiMessage(
    JSON.stringify({
      type: "tool_result",
      tool_id: "t1",
      status: "success",
      output: "file contents",
    }),
  );
  check("tool_result(success) → tool_result", toolResOk?.type === "tool_result");
  check("tool_result.toolIsError = false", toolResOk?.toolIsError === false);
  check("tool_result.toolResult = output", toolResOk?.toolResult === "file contents");

  // tool_result error
  const toolResErr = parseGeminiMessage(
    JSON.stringify({
      type: "tool_result",
      tool_id: "t1",
      status: "error",
      error: { type: "FileNotFound", message: "missing" },
    }),
  );
  check("tool_result(error).toolIsError = true", toolResErr?.toolIsError === true);
  check("tool_result(error).toolResult = error message", toolResErr?.toolResult === "missing");

  // error
  const errMsg = parseGeminiMessage(
    JSON.stringify({ type: "error", severity: "warning", message: "loop detected" }),
  );
  check("error → error", errMsg?.type === "error");
  check("error.errorMessage extracted", errMsg?.errorMessage === "loop detected");

  // result success
  const resultOk = parseGeminiMessage(
    JSON.stringify({
      type: "result",
      status: "success",
      stats: { turn_count: 3, total_duration_ms: 1500 },
    }),
  );
  check(
    "result(success) → complete, no error",
    resultOk?.type === "complete" && resultOk.isError === false,
  );
  check("result.durationMs extracted", resultOk?.durationMs === 1500);
  check("result.numTurns extracted", resultOk?.numTurns === 3);

  // result error
  const resultErr = parseGeminiMessage(
    JSON.stringify({
      type: "result",
      status: "error",
      error: { type: "FatalTurnLimitedError", message: "Max turns exceeded" },
    }),
  );
  check("result(error).isError = true", resultErr?.isError === true);
  check("result(error).errorMessage extracted", resultErr?.errorMessage === "Max turns exceeded");

  // non-JSON → null (filtered out)
  check(
    "non-JSON line → null (skip)",
    parseGeminiMessage("MCP context refresh complete.") === null,
  );
  check("blank-ish JSON without type → null", parseGeminiMessage(JSON.stringify({})) === null);

  // unknown event → progress
  const unknown = parseGeminiMessage(JSON.stringify({ type: "weird_thing", foo: 1 }));
  check("unknown type → progress passthrough", unknown?.type === "progress");

  // ── 4. End-to-end launch (real process) ────────────────────────────────
  console.log("\n─── 4. End-to-end launch ───");
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  console.log(
    `${INFO}  auth mode: ${hasApiKey ? "GEMINI_API_KEY set" : "NO API KEY → testing error path"}`,
  );

  const messages: NormalizedMessage[] = [];
  let exitCode: number | null = null;

  const proc = await adapter.launch(
    {
      sessionId: "smoke-test",
      cwd: process.cwd(),
      prompt: "Reply with exactly the word: hello",
    },
    (msg) => {
      messages.push(msg);
    },
    (code) => {
      exitCode = code;
    },
  );

  check("launch() returned CLIProcess with pid", typeof proc?.pid === "number" && proc.pid > 0);

  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 45000));
  const result = await Promise.race([proc.exited, timeout]);

  if (result === "timeout") {
    console.log(`${FAIL}  launch exceeded 45s. Killing.`);
    proc.kill();
    failures++;
  } else {
    check("process exited", exitCode !== null, `code=${exitCode}`);
  }

  const types = [...new Set(messages.map((m) => m.type))];
  console.log(`    total messages: ${messages.length}`);
  console.log(`    message types: ${types.join(", ") || "(none)"}`);
  const stderrTail = proc.getStderrLines().slice(-3);
  console.log(`    stderr tail (last 3 lines): ${stderrTail.join(" | ").slice(0, 240)}`);

  // Critical invariant: stdout noise (MCP init logs, stack traces) must NOT become assistant messages
  const assistantMsgs = messages.filter((m) => m.type === "assistant");
  const mcpNoiseInAssistant = assistantMsgs.some((m) =>
    (m.content ?? "").toLowerCase().includes("mcp context refresh"),
  );
  check("MCP startup noise filtered out of assistant stream", !mcpNoiseInAssistant);

  const stackTraceInAssistant = assistantMsgs.some(
    (m) =>
      (m.content ?? "").includes("at BaseLlmClient") ||
      (m.content ?? "").includes("node:internal/"),
  );
  check("stack traces filtered out of assistant stream", !stackTraceInAssistant);

  if (hasApiKey) {
    check(
      "received init message",
      messages.some((m) => m.type === "system_init"),
    );
    check("received at least one assistant message", assistantMsgs.length > 0);
    const hasHello = messages.some((m) => (m.content ?? "").toLowerCase().includes("hello"));
    check("response contains 'hello'", hasHello);
    check(
      "received result/complete",
      messages.some((m) => m.type === "complete"),
    );
  } else {
    // Without auth, we verify error surface path.
    const authError = proc.getStderrLines().some((l) => /auth|api[_ ]?key|GEMINI_API_KEY/i.test(l));
    check("auth error captured in stderr buffer (for UI surface)", authError);
    skip("assistant content round-trip", "set GEMINI_API_KEY to test full roundtrip");
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${failures === 0 ? PASS : FAIL}  ${passed} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`${FAIL}  Uncaught:`, err);
  process.exit(1);
});
