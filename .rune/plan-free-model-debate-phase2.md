# Phase 2: Model Picker UI — Bottom Bar + Debate Tag-In

## Goal
Compact bottom bar below chat composer showing current model + free model picker for debate tag-in.

## Tasks
- [ ] Create `ModelBar` component — bottom bar below MessageComposer
- [ ] Create `ModelDropdown` component — shows free + configured models grouped by provider
- [ ] Add "tag into debate" action — click free model → starts/joins debate with that model
- [ ] Add active debate participants indicator (show tagged models as chips)
- [ ] Wire `/api/models` endpoint to populate dropdown dynamically
- [ ] Add model switching for main session (if non-Claude provider configured)

## UI Layout
```
┌──────────────────────────────────────────────┐
│  [Message input...]                     [▶]  │
├──────────────────────────────────────────────┤
│ ⚡ Sonnet 4 ▾ │ 🆓 Gemini Flash ▾  Groq ▾  │
│ (main)        │ (debate participants)     +  │
└──────────────────────────────────────────────┘

ModelDropdown (on click "+"):
┌─────────────────────────────────┐
│ Free models                     │
│  ○ Gemini 2.0 Flash    Free  ✓ │
│  ○ Groq Llama 3.3      Free    │
│  ○ Qwen 3              Free    │
│ ─────────────────────────────── │
│ Your providers                  │
│  ○ Claude Opus          API     │
│  ○ GPT-4o               API    │
│ ─────────────────────────────── │
│ + Connect provider...           │
└─────────────────────────────────┘
```

## Component Architecture
```
SessionView
  └─ MessageComposer
       └─ ModelBar                  ← new
            ├─ MainModelChip        ← current session model (clickable = switch)
            ├─ DebateParticipants   ← chips for tagged free models
            └─ AddModelDropdown     ← "+" button → dropdown with model list
```

## Acceptance Criteria
- [ ] Bottom bar shows current session model
- [ ] Dropdown shows available free models with "Free" badge
- [ ] Clicking a free model tags it as debate participant (chip appears)
- [ ] Clicking X on chip removes model from debate
- [ ] Dropdown groups models by provider with section headers
- [ ] "Connect provider" link navigates to Provider settings page
- [ ] Works on mobile (dropdown is responsive)

## Files Touched
- `packages/web/src/components/session/model-bar.tsx` — new (~200 LOC)
- `packages/web/src/components/session/model-dropdown.tsx` — new (~150 LOC)
- `packages/web/src/components/session/message-composer.tsx` — add ModelBar below
- `packages/web/src/lib/stores/session-store.ts` — add debateParticipants state
- `packages/web/src/lib/api-client.ts` — add models.list() endpoint

## Dependencies
- Phase 1 completed (`/api/models` endpoint available)
