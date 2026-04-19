# Phase 4: Migrate CompactComposer to ComposerCore

## Goal

Delete the ~130 LOC inline `CompactComposer` in `mini-terminal.tsx` and replace its usage with `<ComposerCore variant="compact">`.

## Tasks

- [ ] Open `mini-terminal.tsx`
- [ ] Delete the inline `CompactComposer` function (lines 83-211)
- [ ] Inside `MiniTerminal`, replace `<CompactComposer onSend={sendMessage} isRunning={isRunning} />` with a small wrapper that owns local `text` state and renders `<ComposerCore variant="compact" ... />`
- [ ] Drop unused imports: `useState`, `useCallback` if no longer used elsewhere; `KeyboardEvent`, `PaperPlaneTilt`, `SlashCommandMenu` (now owned by ComposerCore)
- [ ] Verify TS clean
- [ ] Verify tests still pass

## Implementation Sketch

```tsx
function CompactComposer({ onSend, isRunning }: { onSend: (text: string) => void; isRunning: boolean }) {
  const [text, setText] = useState("");
  return (
    <ComposerCore
      variant="compact"
      value={text}
      onChange={setText}
      onSend={() => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setText("");
      }}
      isRunning={isRunning}
      placeholder={isRunning ? "Type to interrupt…" : "Message…"}
    />
  );
}
```

Even simpler: inline this 15-line wrapper directly in the JSX since it's only used in one place. Phase 4 decision = inline.

## Acceptance Criteria

- [x] `mini-terminal.tsx` has no `<textarea>` element anywhere
- [x] No duplicate slash menu / send button code
- [x] All tests still green (47/47)
- [x] TS check clean
- [x] `mini-terminal.tsx`: 487 → 376 LOC (111 line reduction)

## Files Touched

- `packages/web/src/components/grid/mini-terminal.tsx` — remove inline CompactComposer, use ComposerCore
