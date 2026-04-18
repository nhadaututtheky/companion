#!/usr/bin/env bash
# Pre-tool reminder: when editing files covered by .rune/INVARIANTS.md,
# print a one-line warning to stderr so the agent sees it before proceeding.
# Never blocks (exit 0) — this is a nudge, not a gate.

input=$(cat)
if echo "$input" | grep -qE '"file_path":"[^"]*(telegram/|services/ws-|session-store|compact-manager|services/adapters/|types/session\.ts)'; then
  echo "INVARIANTS APPLY — this file is covered by .rune/INVARIANTS.md. Re-read INV-1..INV-12 before editing." >&2
fi
exit 0
