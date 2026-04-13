# Phase 2: Memoization + Render Optimization

## Goal
Stop re-rendering all message bubbles on every stream flush. Currently 30 messages × 20 flushes/sec = 600 bubble re-renders/sec, each re-parsing markdown.

## Tasks
- [ ] Hoist `MarkdownMessage` `components` object to module-level constant
  - Extract `compact` styling to CSS `data-compact` attribute instead of closure
  - This alone eliminates ReactMarkdown full re-parse on unchanged content
- [ ] Wrap `CompactBubble` in `React.memo` with custom comparator
  - Compare: `msg.id`, `msg.content`, `msg.isStreaming`, `msg.thinkingBlocks?.length`
  - Skip re-render if content unchanged (non-streaming messages never change)
- [ ] Wrap `MessageBubble` in `React.memo` with custom comparator
  - Same fields + `msg.toolUseBlocks`, `msg.toolResultBlocks`, `msg.costUsd`
  - Fix `msgRef={() => {}}` → use stable `NOOP_REF` constant
- [ ] Wrap `MarkdownMessage` in `React.memo` — compare `content` + `compact`
- [ ] Hoist `MODEL_RATES` to module level in `use-session.ts`
- [ ] Cache `getSessionName()` result once per `handleMessage` call

## Acceptance Criteria
- [ ] React DevTools Profiler: non-streaming bubbles show 0 re-renders during streaming
- [ ] MarkdownMessage `components` reference is stable (same object across renders)
- [ ] Streaming bubble re-renders only when content changes (every 50ms flush)
- [ ] No visual regression — all markdown, tools, thinking render correctly

## Files Touched
- `packages/web/src/components/chat/markdown-message.tsx` — hoist components, add memo
- `packages/web/src/components/grid/compact-message.tsx` — memo CompactBubble
- `packages/web/src/components/session/message-feed.tsx` — memo MessageBubble, fix msgRef
- `packages/web/src/hooks/use-session.ts` — hoist MODEL_RATES, cache getSessionName

## Dependencies
- Independent of Phase 1 (can run in parallel)
