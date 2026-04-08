# Phase 2: Web UI — Agent Tabs + Spawn Modal

## Goal
Add "Option C" agent tabs to session header so user can monitor and interact with child agents from the brain session. Add lightweight spawn modal.

## Design: Option C — Agent Tabs in Header

### Mini Terminal (Grid Card)
```
┌──────────────────────────────────────┐
│ ● Project Name  typing…  [Opus] [$] │  ← existing header
│ [🔧 Back ●] [🎨 Front ●] [🧪 Test○]│  ← NEW: agent tab bar (only if has children)
├──────────────────────────────────────┤
│ Message feed...                      │
│                                      │
├──────────────────────────────────────┤
│ [Message input...]            [Send] │
└──────────────────────────────────────┘
```

### Expanded View
```
┌── Header ──────────────────────────────────────────┐
│ ● Project Name    [Opus]  [$0.12]   [−] [×]       │
│ [🧠 Brain] [🔧 Backend ●] [🎨 Frontend ●] [+ Add]│
├── Body ────────────────────────────┬── Sidebar ────┤
│ Message feed of SELECTED tab       │ [Details]     │
│ (brain chat or agent chat)         │ [Context]     │
│                                    │ [Agents] ←NEW │
│                                    │               │
│                                    │ Agent cards:  │
│                                    │ 🔧 Backend    │
│                                    │   ● running   │
│                                    │   $0.04       │
│                                    │ 🎨 Frontend   │
│                                    │   ○ idle      │
├── Composer ────────────────────────┤               │
│ [Message input...]          [Send] │               │
└────────────────────────────────────┴───────────────┘
```

## Tasks

### 2.1 — Session store: parent-child tracking
- [ ] Add to Session interface in `session-store.ts`:
  ```typescript
  parentSessionId?: string;
  childSessionIds?: string[];
  brainRole?: "coordinator" | "specialist" | "researcher" | "reviewer";
  agentName?: string;  // display name like "Backend Engineer"
  ```
- [ ] Add store methods:
  - `addChildSession(parentId, childId)` 
  - `removeChildSession(parentId, childId)`
  - `getChildSessions(parentId): Session[]`
- [ ] On `child_spawned` WS event → update parent's childSessionIds
- [ ] On child session end → remove from parent's childSessionIds

### 2.2 — Agent tab bar component
- [ ] New component: `packages/web/src/components/grid/agent-tab-bar.tsx`
- [ ] Shows only when session has `childSessionIds.length > 0`
- [ ] Each tab: colored pill with agent emoji/icon + name + status dot
- [ ] **Active task visual**: running/busy agents get animated indicator:
  - `running` → pulsing glow ring around pill + subtle breathing animation
  - `busy` → same as running (actively processing)
  - `idle` → static dot, muted style
  - `ended` → checkmark (✓) or error (✗) icon, dimmed pill
  - `error` → red dot + red-tinted pill
- [ ] Click tab → switch message feed to that agent's session
- [ ] "🧠 Brain" tab always first (returns to parent)
- [ ] [+ Add] button at end → opens spawn modal
- [ ] Compact enough for mini terminal (height ~28px)

### 2.3 — Agent tab bar in mini-terminal
- [ ] Add `AgentTabBar` between `SessionHeader` and `CompactMessageFeed` in `mini-terminal.tsx`
- [ ] When tab selected, `CompactMessageFeed` shows messages from selected session
- [ ] Composer sends to selected session (not always parent)
- [ ] State: `activeAgentTab` — defaults to parent sessionId

### 2.4 — Agent tab bar in expanded view
- [ ] Add `AgentTabBar` below header in `expanded-session.tsx`
- [ ] Same behavior: switch message feed to selected agent
- [ ] Add "Agents" tab to sidebar showing agent cards with details

### 2.5 — Spawn agent modal
- [ ] New component: `packages/web/src/components/session/spawn-agent-modal.tsx`
- [ ] Triggered by [+ Add] button in agent tab bar
- [ ] Minimal form (NOT full new-session wizard):
  - Agent name (text input, required)
  - Role dropdown (specialist / researcher / reviewer / custom)
  - Model (inherit from parent or override)
  - Persona (optional, from existing personas)
  - Initial instructions (textarea)
- [ ] On submit → `POST /api/sessions/:parentId/spawn`
- [ ] On success → new tab appears in agent tab bar

### 2.6 — Child session indicators
- [ ] Child sessions in grid show "child" badge + parent link
- [ ] Click parent link → scrolls to / highlights parent session
- [ ] If child is spawned from brain, don't add to grid separately (lives in tabs)
- [ ] `gridOrder` filter: skip sessions with `parentSessionId` (they live in tabs)

## Files Touched
- `packages/web/src/lib/stores/session-store.ts` — parent-child fields + methods
- `packages/web/src/components/grid/agent-tab-bar.tsx` — NEW component
- `packages/web/src/components/grid/mini-terminal.tsx` — integrate tab bar
- `packages/web/src/components/grid/expanded-session.tsx` — integrate tab bar + agents sidebar tab
- `packages/web/src/components/session/spawn-agent-modal.tsx` — NEW component
- `packages/web/src/hooks/use-session.ts` — handle child_spawned WS events
- `packages/web/src/app/page.tsx` — filter child sessions from grid

## Acceptance Criteria
- [ ] Brain session with children shows agent tab bar
- [ ] Clicking tab switches message feed to that agent
- [ ] [+ Add] opens spawn modal → creates child → tab appears
- [ ] Child completion updates tab status (✓ done / ✗ error)
- [ ] Child sessions don't clutter the main grid
- [ ] Works in both mini terminal and expanded view
