# Phase 1: DB Schema + Credential Manager

## Goal
Foundation layer: store encrypted OAuth credentials, CRUD operations, active account tracking.

## Tasks
- [x] Add `accounts` table to DB schema (schema.ts)
- [x] Create migration SQL file (0034_accounts.sql) + regenerate embedded-migrations.ts
- [x] Build `credential-manager.ts` service:
  - [x] Reuse existing `encrypt(data)` / `decrypt(data)` from crypto.ts (AES-256-GCM)
  - [x] `saveAccount(label, credentials)` — upsert by OAuth accessToken fingerprint
  - [x] `listAccounts()` — return all accounts (without decrypted tokens)
  - [x] `getActiveAccount()` — return current active account
  - [x] `setActiveAccount(id)` — mark one account as active (deactivate others)
  - [x] `deleteAccount(id)` — remove account
  - [x] `getDecryptedCredentials(id)` — decrypt and return full OAuth tokens
  - [x] `updateAccountStatus(id, status, statusUntil?)` — mark rate_limited/expired/error
  - [x] `renameAccount(id, label)` — update display name
- [x] Add REST routes: GET/POST/PUT/DELETE /api/accounts (accounts.ts)
- [x] Encryption key: uses existing COMPANION_ENCRYPTION_KEY env via crypto.ts

## DB Schema
```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,                        -- "Work Max", "Personal Pro"
  fingerprint TEXT NOT NULL UNIQUE,           -- sha256(accessToken)[:16] for dedup
  encrypted_credentials TEXT NOT NULL,        -- AES-256-GCM encrypted claudeAiOauth JSON
  subscription_type TEXT,                     -- "max", "pro", "free"
  rate_limit_tier TEXT,                       -- "default_claude_max_20x"
  is_active INTEGER NOT NULL DEFAULT 0,       -- only one active at a time
  status TEXT NOT NULL DEFAULT 'ready',       -- ready | rate_limited | expired | error
  status_until INTEGER,                       -- timestamp when rate_limited status expires
  total_cost_usd REAL NOT NULL DEFAULT 0,     -- aggregated from sessions
  last_used_at INTEGER,                       -- last session start timestamp
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Acceptance Criteria
- [x] Accounts table created and migrated
- [x] Can save, list, get, delete accounts via API
- [x] Credentials encrypted at rest — raw tokens never in logs or API responses
- [x] Only one account marked as active at a time
- [x] Encryption key configurable via env var

## Files Touched
- `packages/server/src/db/schema.ts` — add accounts table
- `packages/server/src/db/migrations/XXXX_accounts.sql` — migration
- `packages/server/src/db/embedded-migrations.ts` — regenerate
- `packages/server/src/services/credential-manager.ts` — new
- `packages/server/src/routes/accounts.ts` — new
- `packages/server/src/index.ts` — mount accounts routes
