# Phase 1: Settings Modal Overlay

## Goal
Convert existing /settings page into a modal overlay mounted in root layout. Remove /settings route. Wire Header gear icon + Ctrl+, shortcut. All 7 tab contents unchanged.

## Tasks
- [ ] Create types/settings.ts — SettingsTab union type
- [ ] Extend ui-store.ts — settingsModalOpen + settingsActiveTab state
- [ ] Extract settings-tabs.tsx — move all tab content from page.tsx
- [ ] Create settings-modal.tsx — createPortal modal with vertical sidebar
- [ ] Create settings-modal-provider.tsx — client wrapper for layout.tsx
- [ ] Mount in layout.tsx — alongside CommandPaletteProvider
- [ ] Wire Header gear icon — button onClick instead of <a href>
- [ ] Register Ctrl+, shortcut — in command-palette-provider.tsx
- [ ] Replace /settings/page.tsx — redirect to /
- [ ] Build + verify — all tabs render, shortcuts work

## Acceptance Criteria
- [ ] Settings opens as modal overlay — no page navigation
- [ ] All 7 tabs render identical content to old /settings page
- [ ] Ctrl+, (Win) / Cmd+, (Mac) toggles modal
- [ ] Escape closes modal
- [ ] Click outside backdrop closes modal
- [ ] X button top-right closes modal
- [ ] Tab state persists across open/close
- [ ] bun run build passes clean
- [ ] /settings redirects to /

## Files to Create
- `packages/web/src/types/settings.ts`
- `packages/web/src/components/settings/settings-modal.tsx`
- `packages/web/src/components/settings/settings-tabs.tsx`
- `packages/web/src/components/settings/settings-modal-provider.tsx`

## Files to Modify
- `packages/web/src/lib/stores/ui-store.ts`
- `packages/web/src/components/layout/header.tsx`
- `packages/web/src/components/layout/command-palette-provider.tsx`
- `packages/web/src/app/layout.tsx`
- `packages/web/src/app/settings/page.tsx`

## Z-index Stack
```
Toast (Sonner):           z-9999
SettingsModal backdrop:   z-70
SettingsModal panel:      z-71
NewSessionModal backdrop: z-60
NewSessionModal panel:    z-61
ExpandedSession:          z-50
Header:                   z-10
```

## Dependencies
- None — Phase 1 is standalone
