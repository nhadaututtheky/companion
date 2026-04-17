/**
 * Codex CLI smoke test.
 *
 * Covers: detect, registry wiring, parseCodexMessage unit tests, end-to-end launch.
 *
 * Auth: if OPENAI_API_KEY is set and valid, runs a real round-trip against the API.
 * Otherwise verifies that:
 *   - process still spawns
 *   - non-JSON stdout noise is filtered into stderr, not message stream
 *   - auth error is captured in stderr buffer for UI surface
 *
 * Run: bun run packages/server/scripts/test-codex-smoke.ts
 */

import { CodexAdapter, parseCodexMessage } from "../src/services/adapters/codex-adapter.js";
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
  console.log(`${INFO}  Codex CLI smoke test\n`);

  // ── 1. Detection ────────────────────────────────────────────────────────
  console.log("─── 1. Detection ───");
  const adapter = new CodexAdapter();
  const det = await adapter.detect();
  check("detect() returned an object", typeof det === "object");
  check("codex CLI available", det.available === true, det.available ? `v${det.version}` : "not installed");
  if (!det.available) {
    console.log(`\n${FAIL}  Codex CLI missing. Install: npm i -g @openai/codex-cli`);
    process.exit(1);
  }

  // ── 2. Registry wiring ──────────────────────────────────────────────────
  console.log("\n─── 2. Registry wiring ───");
  const fromRegistry = getAdapter("codex");
  check("getAdapter('codex') returns CodexAdapter", fromRegistry.platform === "codex");
  check("capabilities.outputFormat = ndjson", fromRegistry.capabilities.outputFormat === "ndjson");
  check(
    "capabilities.supportsInteractive = false (exec mode)",
    fromRegistry.capabilities.supportsInteractive === false,
  );
  check("capabilities.supportsResume = false", fromRegistry.capabilities.supportsResume === false);
  check("capabilities.supportsStreaming", fromRegistry.capabilities.supportsStreaming === true);

  const all = await detectAllPlatforms();
  const codexEntry = all.find((a) => a.platform === "codex");
  check("codex present in detectAllPlatforms()", !!codexEntry && codexEntry.detection.available === true);

  // ── 3. Unit tests for parseCodexMessage ─────────────────────────────────
  console.log("\n─── 3. parseCodexMessage unit tests ───");

  // thread.started
  const threadStarted = parseCodexMessage(
    JSON.stringify({ type: "thread.started", thread_id: "thr_abc123" }),
  );
  check("thread.started → system_init", threadStarted?.type === "system_init");
  check("thread.started.sessionId = thread_id", threadStarted?.sessionId === "thr_abc123");

  // turn.started
  const turnStarted = parseCodexMessage(JSON.stringify({ type: "turn.started" }));
  check("turn.started → progress", turnStarted?.type === "progress");

  // item.started with command_execution → tool_use
  const cmdStart = parseCodexMessage(
    JSON.stringify({
      type: "item.started",
      item: { id: "cmd_1", type: "command_execution", command: "ls -la" },
    }),
  );
  check("item.started(command_execution) → assistant", cmdStart?.type === "assistant");
  const cmdBlock = cmdStart?.contentBlocks?.[0];
  check(
    "item.started(command_execution) → tool_use block",
    cmdBlock?.type === "tool_use" && cmdBlock.name === "command_execution",
  );
  check(
    "item.started(command_execution).input.command",
    cmdBlock?.type === "tool_use" && (cmdBlock.input as { command?: string }).command === "ls -la",
  );

  // item.started with other type → progress
  const otherStart = parseCodexMessage(
    JSON.stringify({ type: "item.started", item: { id: "x1", type: "reasoning" } }),
  );
  check("item.started(reasoning) → progress", otherStart?.type === "progress");

  // item.completed with agent_message → assistant
  const agentMsg = parseCodexMessage(
    JSON.stringify({
      type: "item.completed",
      item: { id: "msg_1", type: "agent_message", text: "Hello world" },
    }),
  );
  check("item.completed(agent_message) → assistant", agentMsg?.type === "assistant");
  check("item.completed(agent_message).content extracted", agentMsg?.content === "Hello world");
  check(
    "item.completed(agent_message).contentBlocks populated",
    agentMsg?.contentBlocks?.[0]?.type === "text",
  );

  // item.completed with command_execution success → tool_result
  const cmdDone = parseCodexMessage(
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "cmd_1",
        type: "command_execution",
        status: "completed",
        exit_code: 0,
        aggregated_output: "file1\nfile2",
      },
    }),
  );
  check("item.completed(command_execution, ok) → tool_result", cmdDone?.type === "tool_result");
  check("item.completed(command_execution, ok).toolIsError = false", cmdDone?.toolIsError === false);
  check(
    "item.completed(command_execution, ok).toolResult = aggregated_output",
    cmdDone?.toolResult === "file1\nfile2",
  );
  check("item.completed(command_execution).toolUseId = id", cmdDone?.toolUseId === "cmd_1");

  // item.completed with command_execution failure → tool_result isError=true
  const cmdFail = parseCodexMessage(
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "cmd_2",
        type: "command_execution",
        status: "failed",
        exit_code: 1,
        aggregated_output: "permission denied",
      },
    }),
  );
  check("item.completed(command_execution, failed).toolIsError = true", cmdFail?.toolIsError === true);

  // item.completed with non-zero exit code (status not failed) still errors
  const cmdExitCode = parseCodexMessage(
    JSON.stringify({
      type: "item.completed",
      item: { id: "cmd_3", type: "command_execution", exit_code: 127, aggregated_output: "not found" },
    }),
  );
  check("item.completed(command_execution, exit_code!=0).toolIsError = true", cmdExitCode?.toolIsError === true);

  // turn.completed with usage → complete
  const turnDone = parseCodexMessage(
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 50 },
    }),
  );
  check("turn.completed → complete", turnDone?.type === "complete");
  check("turn.completed.isError = false", turnDone?.isError === false);
  check("turn.completed.tokenUsage.input = 100", turnDone?.tokenUsage?.input === 100);
  check("turn.completed.tokenUsage.output = 50", turnDone?.tokenUsage?.output === 50);
  check("turn.completed.tokenUsage.cacheRead = 40", turnDone?.tokenUsage?.cacheRead === 40);

  // turn.completed without usage
  const turnDoneNoUsage = parseCodexMessage(JSON.stringify({ type: "turn.completed" }));
  check("turn.completed (no usage) → complete", turnDoneNoUsage?.type === "complete");
  check("turn.completed (no usage).tokenUsage = undefined", turnDoneNoUsage?.tokenUsage === undefined);

  // error event
  const errMsg = parseCodexMessage(JSON.stringify({ type: "error", message: "API quota exceeded" }));
  check("error → error", errMsg?.type === "error");
  check("error.errorMessage extracted", errMsg?.errorMessage === "API quota exceeded");

  // error with { error } field instead of message
  const errMsgAlt = parseCodexMessage(JSON.stringify({ type: "error", error: "rate limited" }));
  check("error with 'error' field → error", errMsgAlt?.type === "error");
  check("error.errorMessage falls back to error field", errMsgAlt?.errorMessage === "rate limited");

  // non-JSON → null (filtered out)
  check("non-JSON line → null", parseCodexMessage("WARN: tracing subscriber installed") === null);
  check("blank JSON without type → null", parseCodexMessage(JSON.stringify({})) === null);

  // unknown event → progress
  const unknown = parseCodexMessage(JSON.stringify({ type: "some_future_event", foo: 1 }));
  check("unknown type → progress passthrough", unknown?.type === "progress");

  // item.started without item → progress
  const itemStartNoItem = parseCodexMessage(JSON.stringify({ type: "item.started" }));
  check("item.started (no item) → progress", itemStartNoItem?.type === "progress");

  // item.completed without item → progress
  const itemDoneNoItem = parseCodexMessage(JSON.stringify({ type: "item.completed" }));
  check("item.completed (no item) → progress", itemDoneNoItem?.type === "progress");

  // ── 4. End-to-end launch (real process) ────────────────────────────────
  console.log("\n─── 4. End-to-end launch ───");
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  console.log(`${INFO}  auth mode: ${hasApiKey ? "OPENAI_API_KEY set" : "NO API KEY → testing error path"}`);

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

  // Critical invariant: stdout noise must NOT become assistant messages
  const assistantMsgs = messages.filter((m) => m.type === "assistant");
  const tracingInAssistant = assistantMsgs.some((m) =>
    /tracing|subscriber installed|WARN|ERROR\s/.test(m.content ?? ""),
  );
  check("tracing/log noise filtered out of assistant stream", !tracingInAssistant);

  // Codex can auth via OPENAI_API_KEY OR cached `codex login` session in ~/.codex/auth.json.
  // Detect real success by: exit 0 + got at least one assistant message.
  const succeeded = exitCode === 0 && assistantMsgs.length > 0;
  if (succeeded) {
    check("received thread.started (system_init)", messages.some((m) => m.type === "system_init"));
    check("received at least one assistant message", assistantMsgs.length > 0);
    const hasHello = messages.some((m) => (m.content ?? "").toLowerCase().includes("hello"));
    check("response contains 'hello'", hasHello);
    check("received turn.completed (complete)", messages.some((m) => m.type === "complete"));
  } else {
    const authError = proc
      .getStderrLines()
      .some((l) => /auth|api[_ ]?key|OPENAI_API_KEY|login/i.test(l));
    check("auth/error captured in stderr buffer (for UI surface)", authError);
    skip("assistant content round-trip", "run `codex login` or set OPENAI_API_KEY to test full roundtrip");
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${failures === 0 ? PASS : FAIL}  ${passed} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`${FAIL}  Uncaught:`, err);
  process.exit(1);
});
