/**
 * OpenCode CLI smoke test.
 *
 * Covers: detect, registry wiring, parseOpenCodeMessage unit tests, end-to-end launch.
 *
 * Auth: OpenCode supports many providers. If a provider is configured (via `opencode auth`),
 * runs a real round-trip. Otherwise verifies that:
 *   - process still spawns
 *   - non-JSON stdout noise is filtered into stderr, not message stream
 *   - provider-not-configured error is captured in stderr buffer for UI surface
 *
 * Run: bun run packages/server/scripts/test-opencode-smoke.ts
 * Optional env: OPENCODE_MODEL (e.g. "anthropic/claude-sonnet-4-6") to pick a provider/model.
 */

import {
  OpenCodeAdapter,
  parseOpenCodeMessage,
} from "../src/services/adapters/opencode-adapter.js";
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
  console.log(`${INFO}  OpenCode CLI smoke test\n`);

  // ── 1. Detection ────────────────────────────────────────────────────────
  console.log("─── 1. Detection ───");
  const adapter = new OpenCodeAdapter();
  const det = await adapter.detect();
  check("detect() returned an object", typeof det === "object");
  check("opencode CLI available", det.available === true, det.available ? `v${det.version}` : "not installed");
  if (!det.available) {
    console.log(`\n${FAIL}  OpenCode CLI missing. Install: curl -fsSL https://opencode.ai/install | bash`);
    process.exit(1);
  }

  // ── 2. Registry wiring ──────────────────────────────────────────────────
  console.log("\n─── 2. Registry wiring ───");
  const fromRegistry = getAdapter("opencode");
  check("getAdapter('opencode') returns OpenCodeAdapter", fromRegistry.platform === "opencode");
  check("capabilities.outputFormat = ndjson", fromRegistry.capabilities.outputFormat === "ndjson");
  check("capabilities.supportsInteractive = false (run mode)", fromRegistry.capabilities.supportsInteractive === false);
  check("capabilities.supportsResume = true", fromRegistry.capabilities.supportsResume === true);
  check("capabilities.supportsStreaming", fromRegistry.capabilities.supportsStreaming === true);
  check("capabilities.supportsThinking = true", fromRegistry.capabilities.supportsThinking === true);

  const all = await detectAllPlatforms();
  const opencodeEntry = all.find((a) => a.platform === "opencode");
  check("opencode present in detectAllPlatforms()", !!opencodeEntry && opencodeEntry.detection.available === true);

  // ── 3. Unit tests for parseOpenCodeMessage ─────────────────────────────
  console.log("\n─── 3. parseOpenCodeMessage unit tests ───");

  // step-start → system_init
  const stepStart = parseOpenCodeMessage(
    JSON.stringify({
      type: "step_start",
      timestamp: 1712345678,
      sessionID: "ses_abc",
      part: { id: "p1", messageID: "m1", sessionID: "ses_abc", type: "step-start" },
    }),
  );
  check("step-start → system_init", stepStart?.type === "system_init");
  check("step-start.sessionId extracted", stepStart?.sessionId === "ses_abc");

  // text → assistant
  const textEvt = parseOpenCodeMessage(
    JSON.stringify({
      type: "text",
      timestamp: 1712345679,
      sessionID: "ses_abc",
      part: {
        id: "p2",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "text",
        text: "Hello world",
      },
    }),
  );
  check("text → assistant", textEvt?.type === "assistant");
  check("text.content extracted", textEvt?.content === "Hello world");
  check("text.contentBlocks populated", textEvt?.contentBlocks?.[0]?.type === "text");

  // reasoning → progress (thinking)
  const reasoning = parseOpenCodeMessage(
    JSON.stringify({
      type: "reasoning",
      timestamp: 1712345680,
      sessionID: "ses_abc",
      part: {
        id: "p3",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "reasoning",
        text: "Let me think...",
      },
    }),
  );
  check("reasoning → progress", reasoning?.type === "progress");
  check("reasoning block is thinking type", reasoning?.contentBlocks?.[0]?.type === "thinking");

  // tool completed → assistant with tool_use block
  const toolDone = parseOpenCodeMessage(
    JSON.stringify({
      type: "tool",
      timestamp: 1712345681,
      sessionID: "ses_abc",
      part: {
        id: "p4",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "tool",
        tool: "read",
        callID: "call_1",
        state: {
          status: "completed",
          input: { filePath: "a.txt" },
          output: "file contents",
        },
      },
    }),
  );
  check("tool (completed) → assistant", toolDone?.type === "assistant");
  const toolBlock = toolDone?.contentBlocks?.[0];
  check(
    "tool (completed) block is tool_use with tool name",
    toolBlock?.type === "tool_use" && toolBlock.name === "read",
  );
  check(
    "tool (completed) block id = callID",
    toolBlock?.type === "tool_use" && toolBlock.id === "call_1",
  );
  check(
    "tool (completed) block input preserved",
    toolBlock?.type === "tool_use" &&
      (toolBlock.input as { filePath?: string }).filePath === "a.txt",
  );

  // tool in-progress → assistant with tool_use block
  const toolPending = parseOpenCodeMessage(
    JSON.stringify({
      type: "tool",
      timestamp: 1712345682,
      sessionID: "ses_abc",
      part: {
        id: "p5",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "tool",
        tool: "bash",
        callID: "call_2",
        state: { status: "pending", input: { command: "ls" }, output: "" },
      },
    }),
  );
  check("tool (pending) → assistant", toolPending?.type === "assistant");

  // patch → tool_result
  const patchEvt = parseOpenCodeMessage(
    JSON.stringify({
      type: "patch",
      timestamp: 1712345683,
      sessionID: "ses_abc",
      part: {
        id: "p6",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "patch",
        text: "+++ a.txt\n+hello",
      },
    }),
  );
  check("patch → tool_result", patchEvt?.type === "tool_result");
  check("patch.content preserved", patchEvt?.content === "+++ a.txt\n+hello");

  // step-finish with tokens → complete
  const stepFinish = parseOpenCodeMessage(
    JSON.stringify({
      type: "step_finish",
      timestamp: 1712345684,
      sessionID: "ses_abc",
      part: {
        id: "p7",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "step-finish",
        reason: "stop",
        cost: 0.0012,
        tokens: {
          total: 150,
          input: 100,
          output: 50,
          reasoning: 0,
          cache: { write: 0, read: 40 },
        },
      },
    }),
  );
  check("step-finish → complete", stepFinish?.type === "complete");
  check("step-finish.isError = false (reason='stop')", stepFinish?.isError === false);
  check("step-finish.costUsd extracted", stepFinish?.costUsd === 0.0012);
  check("step-finish.tokenUsage.input", stepFinish?.tokenUsage?.input === 100);
  check("step-finish.tokenUsage.output", stepFinish?.tokenUsage?.output === 50);
  check("step-finish.tokenUsage.cacheRead", stepFinish?.tokenUsage?.cacheRead === 40);

  // step-finish with reason=error → complete with isError
  const stepFinishErr = parseOpenCodeMessage(
    JSON.stringify({
      type: "step_finish",
      timestamp: 1712345685,
      sessionID: "ses_abc",
      part: {
        id: "p8",
        messageID: "m1",
        sessionID: "ses_abc",
        type: "step-finish",
        reason: "error",
      },
    }),
  );
  check("step-finish(error) → isError = true", stepFinishErr?.isError === true);

  // error event
  const errEvt = parseOpenCodeMessage(
    JSON.stringify({
      type: "error",
      timestamp: 1712345686,
      sessionID: "ses_abc",
      part: { id: "p9", messageID: "m1", sessionID: "ses_abc", type: "error", text: "Provider auth failed" },
    }),
  );
  check("error → error", errEvt?.type === "error");
  check("error.errorMessage extracted", errEvt?.errorMessage === "Provider auth failed");

  // non-JSON → null (filtered out — the critical noise-filter fix)
  check(
    "non-JSON banner line → null",
    parseOpenCodeMessage("opencode v1.3.17 starting...") === null,
  );
  check("empty object → progress fallback", parseOpenCodeMessage(JSON.stringify({})) !== null);

  // unknown part type → progress
  const unknownPart = parseOpenCodeMessage(
    JSON.stringify({
      type: "unknown_event",
      timestamp: 1,
      sessionID: "s",
      part: { id: "x", messageID: "m", sessionID: "s", type: "something_new" },
    }),
  );
  check("unknown part type → progress passthrough", unknownPart?.type === "progress");

  // event with no part → progress
  const noPart = parseOpenCodeMessage(JSON.stringify({ type: "whatever", timestamp: 1, sessionID: "s" }));
  check("event without part → progress", noPart?.type === "progress");

  // ── 4. End-to-end launch (real process) ────────────────────────────────
  console.log("\n─── 4. End-to-end launch ───");
  const model = process.env.OPENCODE_MODEL;
  console.log(`${INFO}  auth mode: ${model ? `OPENCODE_MODEL=${model}` : "no model override — relies on default provider"}`);

  const messages: NormalizedMessage[] = [];
  let exitCode: number | null = null;

  const proc = await adapter.launch(
    {
      sessionId: "smoke-test",
      cwd: process.cwd(),
      prompt: "Reply with exactly the word: hello",
      model,
    },
    (msg) => {
      messages.push(msg);
    },
    (code) => {
      exitCode = code;
    },
  );

  check("launch() returned CLIProcess with pid", typeof proc?.pid === "number" && proc.pid > 0);

  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 60000));
  const result = await Promise.race([proc.exited, timeout]);

  if (result === "timeout") {
    console.log(`${FAIL}  launch exceeded 60s. Killing.`);
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

  // Critical invariant: non-JSON stdout (startup banner) must NOT become assistant messages
  const assistantMsgs = messages.filter((m) => m.type === "assistant");
  const bannerInAssistant = assistantMsgs.some((m) =>
    /opencode v\d|starting|loading config/i.test(m.content ?? ""),
  );
  check("startup banner filtered out of assistant stream", !bannerInAssistant);

  const succeeded = exitCode === 0 && assistantMsgs.length > 0;
  if (succeeded) {
    check("received step_start (system_init)", messages.some((m) => m.type === "system_init"));
    check("received at least one assistant message", assistantMsgs.length > 0);
    const hasHello = messages.some((m) => (m.content ?? "").toLowerCase().includes("hello"));
    check("response contains 'hello'", hasHello);
    check("received step_finish (complete)", messages.some((m) => m.type === "complete"));
  } else {
    const authError = proc
      .getStderrLines()
      .some((l) => /auth|api[_ ]?key|provider|login|model|not configured/i.test(l));
    check("provider/auth error captured in stderr buffer (for UI surface)", authError);
    skip("assistant content round-trip", "configure a provider via `opencode auth login` to test");
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${failures === 0 ? PASS : FAIL}  ${passed} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`${FAIL}  Uncaught:`, err);
  process.exit(1);
});
