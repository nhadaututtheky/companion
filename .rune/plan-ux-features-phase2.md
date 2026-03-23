# Phase 2: Feed & Analytics (Inline Diff, Pins, Session Compare, Cost Breakdown)

## Goal
Enhance the message feed with inline diffs for file edits and pinnable messages, add session comparison view, and expand cost display with token breakdown.

---

## Task 4: Inline Diff in Message Feed

### Web
- [ ] In `message-feed.tsx`, detect tool_use blocks where `name` is `Edit` or `Write`
- [ ] Extract `old_string`/`new_string` from Edit input, or full content from Write
- [ ] Create `inline-diff.tsx` component — renders unified diff with green/red lines
- [ ] Reuse existing LCS diff logic already present in message-feed.tsx
- [ ] Collapsible by default if diff > 20 lines, show "N lines changed" summary
- [ ] Show file path header above each diff block

### Files
| File | Action |
|------|--------|
| `packages/web/src/components/session/inline-diff.tsx` | new |
| `packages/web/src/components/session/message-feed.tsx` | modify — render InlineDiff for edit tools |

### Acceptance Criteria
- [ ] Edit tool results show colored unified diff inline (red=removed, green=added)
- [ ] Write tool results show full file as green (new file) or diff if overwrite
- [ ] Large diffs are collapsed by default with expandable toggle
- [ ] Diff rendering does not break message feed scroll performance

---

## Task 5: Pin/Bookmark Messages

### Web
- [ ] Add `pinned-messages-store.ts` — stores pinned message IDs per session in localStorage
- [ ] Interface: `{ pins: Map<sessionId, Set<messageId>>, togglePin, isPinned, getPins }`
- [ ] Add pin/star icon button on message hover in `message-feed.tsx`
- [ ] Create `pinned-messages-drawer.tsx` — slide-out panel listing pinned messages
- [ ] Each pinned item shows message preview + "jump to" button (scrollIntoView)
- [ ] Add pin count badge in session header or toolbar

### Files
| File | Action |
|------|--------|
| `packages/web/src/lib/stores/pinned-messages-store.ts` | new |
| `packages/web/src/components/session/pinned-messages-drawer.tsx` | new |
| `packages/web/src/components/session/message-feed.tsx` | modify — add pin button on hover |

### Acceptance Criteria
- [ ] Hovering a message shows a pin/star icon on the right edge
- [ ] Clicking pin icon toggles pin state, pinned messages show filled star
- [ ] Pinned drawer lists all pinned messages with preview text
- [ ] Clicking a pinned message scrolls the feed to that message
- [ ] Pins persist across page refresh (localStorage)

---

## Task 6: Session Comparison

### Web
- [ ] Create `session-compare-modal.tsx` — full-screen modal with two side-by-side feeds
- [ ] Session picker (dropdown) for left and right panels
- [ ] Reuse `MessageFeed` component for each side
- [ ] Load messages via existing `api.sessions.get()` or WS message_history
- [ ] Add "Compare" action in session context menu and command palette
- [ ] Add `compareModalOpen` + `compareSessionIds` to `ui-store.ts`

### Files
| File | Action |
|------|--------|
| `packages/web/src/components/session/session-compare-modal.tsx` | new |
| `packages/web/src/lib/stores/ui-store.ts` | modify — add compare state |
| `packages/web/src/components/layout/command-palette.tsx` | modify — add Compare action |

### Acceptance Criteria
- [ ] Compare modal shows two sessions side-by-side with independent scroll
- [ ] Can switch either session via dropdown without closing modal
- [ ] Works with both active and ended sessions
- [ ] Escape or close button dismisses the modal
- [ ] Useful for Ring broadcast: compare how different agents handled same prompt

---

## Task 7: Cost Breakdown per Session

### Web
- [ ] Create `cost-breakdown.tsx` component — expandable panel showing token details
- [ ] Display: input tokens, output tokens, cache creation, cache read, total cost
- [ ] Use existing session fields: `totalInputTokens`, `totalOutputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `totalCostUsd`
- [ ] Show as expandable section in `session-details.tsx` (click cost badge to expand)
- [ ] Add bar chart or proportional bars for visual token distribution
- [ ] Format numbers with `Intl.NumberFormat` compact notation

### Files
| File | Action |
|------|--------|
| `packages/web/src/components/session/cost-breakdown.tsx` | new |
| `packages/web/src/components/session/session-details.tsx` | modify — integrate breakdown |

### Acceptance Criteria
- [ ] Cost badge in session header expands to show full token breakdown
- [ ] Shows input/output/cache tokens with formatted numbers
- [ ] Visual bars show proportion of each token type
- [ ] Cost per token type calculated and displayed (input vs output pricing)
- [ ] Compact view shows just total; expanded shows all details
