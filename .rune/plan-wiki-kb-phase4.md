# Phase 4: Feature Discovery UX — Settings Redesign + Onboarding

## Goal
Users don't know Companion has ~30 features. Many are hidden behind APIs with zero UI.
Redesign Settings and add contextual discovery so users find features when they need them.

## Problem Analysis

### Current state (from audit):
- **8 settings tabs** — mostly infrastructure (Domain, AI Provider, Telegram, MCP)
- **Hidden features with no UI:** Workflows, Schedules, Custom Personas, Access PIN, CLI Platforms
- **Partially hidden:** Saved Prompts (only in composer), Templates (only in new-session modal)
- **No onboarding:** New user lands on empty dashboard, no guidance
- **No feature explanation:** RTK, CodeGraph, Pulse Monitor exist but users don't know what they do or when to use them
- **Free vs Pro confusion:** Users don't know what they're missing or what features they have

### Design principles:
1. **Show, don't document** — features explain themselves in context
2. **Progressive disclosure** — basic first, advanced when ready
3. **Zero-state guidance** — empty states tell you what to do
4. **Feature cards** — each feature has a 1-liner "what" + "when to use"

## Tasks

### A. Settings Page Restructure
Current 8 tabs → reorganize into **4 sections**:

```
SETTINGS (redesigned)
├── Connection         ← merged: Server URL, API Key, Access PIN
│   └── inline help: "How Companion connects to Claude Code"
├── AI & Knowledge     ← merged: AI Provider + RTK + Wiki KB config + CodeGraph toggle
│   ├── Provider setup (API key, model, base URL)
│   ├── Knowledge Base (wiki domain, default domain, compile settings)
│   ├── Token Compression (RTK level, strategy toggles)
│   └── Code Intelligence (CodeGraph enable, scan settings)
├── Integrations       ← merged: Telegram + MCP + Obsidian (future)
│   ├── Telegram Bots (existing CRUD)
│   ├── MCP Servers (existing CRUD)
│   └── External Sources (Obsidian bridge — Phase 5 placeholder)
└── Appearance & Access ← merged: Theme + License + Security
    ├── Theme toggle
    ├── License status + upgrade
    ├── Prompt scanning toggle
    └── Access PIN setup (NEW — currently API-only)
```

- [ ] Refactor `settings-tabs.tsx` — 4 sections instead of 8 tabs
- [ ] Each section has collapsible sub-groups
- [ ] Add Access PIN UI (currently hidden, API-only)
- [ ] Move Domain config to Connection section (it's about access, not a standalone thing)

### B. Feature Guide Panel ("What Can I Do?")
- [ ] New component: `packages/web/src/components/feature-guide/`
  - `feature-guide-modal.tsx` — full-screen overlay (opened from "?" button or Cmd+/)
  - `feature-card.tsx` — individual feature card
- [ ] Feature card design:
  ```
  ┌─────────────────────────────────────┐
  │ icon  Feature Name           [FREE] │
  │       One-line description          │
  │       "When to use: ..."            │
  │                          [Try it →] │
  └─────────────────────────────────────┘
  ```
- [ ] Feature cards grouped by category:
  - **Session Management** — Multi-session, Templates, Saved Prompts, Thinking Mode
  - **AI Intelligence** — Wiki KB, CodeGraph, RTK, Pulse Monitor, Context Estimator
  - **Collaboration** — Telegram, Debate, Shared Channels, @Mentions
  - **Developer Tools** — Terminal, File Explorer, Browser Preview, Inline Diff
  - **Automation** — Workflows, Schedules, Auto-Approve, MCP Servers
  - **Security** — Permission Gate, Prompt Scanning, Access PIN
- [ ] Each card links to:
  - Settings section (if configurable)
  - Panel (if it has a panel)
  - Action (if it's a "try it" feature)
- [ ] Free/Pro badge on each card
- [ ] Search/filter by category or keyword

### C. Contextual Feature Tips
- [ ] `packages/web/src/components/feature-guide/feature-tip.tsx`
  - Small tooltip component that appears next to relevant UI elements
  - Shows feature name + 1 sentence + "Learn more"
  - Dismissible (stored in localStorage: `dismissed_tips`)
- [ ] Key tip placements:
  - Empty session list → "Create your first session" + mention Templates
  - First Telegram message → "You can also control sessions from Telegram"
  - CodeGraph panel empty → "Run a scan to see your code structure"
  - Wiki panel empty → "Drop files here to build your knowledge base"
  - RTK stats showing → "RTK saved X tokens this session — configure in Settings"
  - Pulse warning appears → "Pulse Monitor detects when your agent is struggling"

### D. Zero-State Improvements
- [ ] Every panel gets a proper empty state:
  - **Wiki Panel** → "No knowledge base yet. Drop files or paste URLs to get started."
  - **CodeGraph** → "No scan data. Click 'Scan Project' to index your codebase."
  - **Terminal** → "Click to open a terminal session." (already decent)
  - **Debate** → "Start a debate to get multiple AI perspectives on a problem."
  - **Context Panel** → "Context usage will appear when a session is active."
- [ ] Empty states include:
  - Illustration (simple icon, not complex graphic)
  - 1-sentence explanation
  - Primary action button
  - "Learn more" link → Feature Guide

### E. First-Run Onboarding
- [ ] `packages/web/src/components/onboarding/`
  - `onboarding-modal.tsx` — shows on first visit (localStorage: `onboarding_completed`)
  - 3-4 step wizard (not a tour — a quick intro)
  - Step 1: "Welcome" — what Companion is (1 sentence)
  - Step 2: "Your tier" — Free/Trial/Pro, what's included
  - Step 3: "Quick start" — create session or connect Telegram
  - Step 4: "Explore" — link to Feature Guide
- [ ] Subtle, dismissible — not a forced flow
- [ ] Shows again if tier changes (e.g. Free → Trial → Pro)

## Acceptance Criteria
- [ ] Settings restructured into 4 logical sections
- [ ] Feature Guide shows all ~30 features with clear descriptions
- [ ] Each feature card has: icon, name, 1-liner, when-to-use, tier badge, action link
- [ ] Feature Guide searchable and filterable
- [ ] Contextual tips appear next to relevant empty states
- [ ] Tips are dismissible and don't re-show
- [ ] First-run onboarding for new users
- [ ] Access PIN configurable from UI (no longer API-only)
- [ ] All "hidden" features now discoverable

## Files Touched
- `packages/web/src/components/settings/settings-tabs.tsx` — major refactor
- `packages/web/src/components/settings/settings-modal.tsx` — modify (new sections)
- `packages/web/src/components/feature-guide/feature-guide-modal.tsx` — new
- `packages/web/src/components/feature-guide/feature-card.tsx` — new
- `packages/web/src/components/feature-guide/feature-tip.tsx` — new
- `packages/web/src/components/feature-guide/feature-data.ts` — new (feature definitions)
- `packages/web/src/components/onboarding/onboarding-modal.tsx` — new
- Multiple panel components — modify (empty states)
- `packages/web/src/lib/stores/ui-store.ts` — modify (feature guide state)

## Dependencies
- Phase 1-3 complete (Wiki KB exists to showcase in feature guide)
- Feature audit data (already collected)
