# Phase 2: File Watcher + Account Switch + Session Integration

## Goal
Auto-capture credentials after `/login`, instant account switching, sessions use active account.

## Tasks
- [x] Build `credential-watcher.ts` service:
  - [x] Poll `~/.claude/.credentials.json` every 2s (mtime check, not fs.watch — Windows unreliable)
  - [x] On change: read file → extract `claudeAiOauth` section
  - [x] Compute fingerprint → check if already saved
  - [x] If new: auto-save to DB, label as "{subscriptionType} #{count+1}"
  - [x] If existing: update tokens (refresh token may have changed)
  - [x] Set newly captured account as active
  - [x] Emit event: `account:captured` (for UI notification)
- [x] Build `switchAccount(accountId)` function:
  - [x] Read current `~/.claude/.credentials.json`
  - [x] Replace only `claudeAiOauth` section (preserve `mcpOAuth`)
  - [x] Write back to file
  - [x] Update DB: set new active, unset old active
  - [x] Emit event: `account:switched`
- [x] Integrate with session creation:
  - [x] Add `account_id` column to sessions table (nullable, for migration compat)
  - [ ] `ws-session-lifecycle.ts`: record `accountId` on session start (deferred to Phase 3 — needs active account lookup at session creation)
- [x] Add REST endpoints:
  - [x] PUT /api/accounts/:id/activate — switch active account (writes credentials file)
  - [x] POST /api/accounts/capture — manual trigger (re-read credentials file)
- [x] Start watcher on server boot + stop on shutdown

## File Watcher Design
```typescript
// Poll-based (reliable on Windows)
let lastMtime = 0;
setInterval(async () => {
  const stat = await fs.stat(CREDENTIALS_PATH);
  if (stat.mtimeMs !== lastMtime) {
    lastMtime = stat.mtimeMs;
    await captureCredentials();
  }
}, 2000);
```

## Switch Logic
```typescript
async function switchAccount(accountId: string) {
  const creds = getDecryptedCredentials(accountId);
  const file = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
  file.claudeAiOauth = creds;  // Replace only OAuth section
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(file));
  setActiveAccount(accountId);
  // Pause watcher briefly to avoid re-capturing our own write
}
```

## Acceptance Criteria
- [ ] After `/login` in Claude Code, account auto-saved in Companion within 3s
- [ ] Duplicate logins update tokens instead of creating new account
- [ ] Switch account writes credentials file — next session uses new account
- [ ] Running sessions unaffected by switch (they already have their CLI process)
- [ ] mcpOAuth section preserved during switch (not overwritten)
- [ ] Sessions table tracks which account was used

## Files Touched
- `packages/server/src/services/credential-watcher.ts` — new
- `packages/server/src/services/credential-manager.ts` — add switchAccount()
- `packages/server/src/services/ws-session-lifecycle.ts` — record accountId
- `packages/server/src/db/schema.ts` — add account_id to sessions
- `packages/server/src/db/migrations/XXXX_session_account.sql` — migration
- `packages/server/src/routes/accounts.ts` — add activate/capture endpoints
- `packages/server/src/index.ts` — start watcher on boot
