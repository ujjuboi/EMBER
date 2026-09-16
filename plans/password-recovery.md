# Password recovery / reset

## Status

**Implemented.** Applies to a local-first PWA: there is **no server and no central
account registry**, so classic email-reset links cannot work (different devices
each hold their own `ember_db` copy). Recovery must prove ownership of the
account **and** the device/offline artifact. Design approved: per-account
**recovery code** stored as a PBKDF2 hash (schema v6), plus
**restore-with-new-password**.

## Goal

1. A user who forgets their password can regain access **without a backend** by
   presenting their email + a one-time recovery code minted at signup.
2. Recovery codes are stored hashed (never plaintext), reusing the existing
   PBKDF2 machinery from `src/lib/password.ts`.
3. Backup restore can optionally set a **fresh password** (the old backup hash
   is otherwise unknown, and `importData` blocks same-email restores).
4. Existing installs migrate data-preservingly; pre-v6 accounts stay usable and
   can mint a code from You.

The current backup cannot recover a password on its own: it round-trips the
*same* `password_hash` (the unknown password), so recovery requires the ability
to **overwrite the hash** — that capability is what this plan adds.

## Design

### Recovery code

- Random **12-char** code from `crypto.getRandomValues` over the ambiguity-free
  32-symbol alphabet (`A-Z` + `2-9` minus `I L O 0`) — ~60 bits of entropy.
- Stored **hashed**: `recovery_salt` + `recovery_hash` on the `account` table,
  produced with `generateSalt()` / `hashPassword()` and checked with the
  constant-time `verify()` in `src/lib/password.ts` (PBKDF2-SHA256, 100k iters,
  per-account salt). A DB read leaks nothing usable.
- **Shown once** at signup (fresh plaintext); never persisted, never
  re-displayed. Regenerating from You invalidates the old code.
- Pre-v6 accounts have `recovery_hash NULL` → `verifyRecoveryCode` returns
  `false` until they generate a code from the You tab.
- Reset errors never reveal whether the email exists — mirror the login copy:
  "No account for that email, or wrong code." (No rate limiting; local app.)

### Reset flow

`Forgot password?` → enter email + recovery code + new password →

1. Validate email (`@`) and password (≥ 6 chars, same as signup).
2. `verifyRecoveryCode(email, code)` — constant-time; false when no code set.
3. `resetPassword(email, newPassword)` — fresh salt + PBKDF2 hash, `UPDATE
   account SET password_hash, salt`.
4. Show a **reset confirmation**, then return to the login screen (`/`) — a
   fresh password is confirmed before the user signs in with it (no silent
   session).

Either the wrong code or an unknown email produces the same generic error.

### Restore-with-new-password

`importData(file, { intoEmail, newPassword? })`:
- After `importAccount` writes the backup rows, if `newPassword` is given, run
  `resetPassword` over that account so the fresh password (not the backup's
  unknown hash) is active, then sign in with it.
- Backup `account` round-trips `recoverySalt`/`recoveryHash`; schema-4/5
  backups restore with those fields defaulted to NULL (no recovery until a code
  is generated).

## Files

### `src/lib/db/index.ts`

- Schema **v6** — data-preserving `migrateV5toV6()` (bump `SCHEMA_VERSION`):
  - `ALTER TABLE account ADD COLUMN recovery_salt TEXT`
  - `ALTER TABLE account ADD COLUMN recovery_hash TEXT`
- New exports:
  - `setRecoveryCode(email, code)` — hash code (or clear), write salt+hash.
  - `verifyRecoveryCode(email, code): Promise<boolean>` — `false` when hash is
    NULL; constant-time via `password.verify`.
  - `resetPassword(email, newPassword)` — fresh salt + `hashPassword`, update
    `account.password_hash`/`salt`.
- `exportAccount` writes `account.recoverySalt`/`recoveryHash`;
  `importAccount` restores them (default NULL when absent).

### `src/lib/types.ts`

- `EmberBackup.account` += `recoverySalt: string | null`,
  `recoveryHash: string | null`.

### `src/lib/backup.ts`

- `BACKUP_SCHEMA` 5 → 6; `SUPPORTED_BACKUP_SCHEMAS` `[4, 5, 6]`.
- `parseBackup` defaults missing recovery fields (older backups) cleanly.

### `src/lib/store.tsx` + `src/lib/store-hooks.ts`

- `createAccount` returns `{ ok, error?, recoveryCode }` — generates + persists
  the code hash; AuthPage shows the plaintext once.
- `generateRecoveryCode(): string` — re-hash, return fresh plaintext once
  (You tab; Confirm warns it invalidates the old code).
- `resetPassword(email, recoveryCode, newPassword)` — validate, verify code,
  reset the hash (does **not** set a session); returns `{ ok, error? }`. The
  page shows a confirmation and sends the user to login.
- `importData(file, { intoEmail, newPassword? })` — apply new password after
  restore.
- Extract a shared "load account + commit signed-in state" helper used by
  `logIn` and `createAccount` (post-signup) to avoid duplicating the hydration
  block (reset deliberately does not sign in).

### UI

- `src/features/auth/AuthPage.tsx` — signup success shows a one-time
  **recovery-code modal** ("I saved it") before navigating to `/onboarding`;
  add a **Forgot password?** link.
- `src/App.tsx` + new `src/features/auth/ResetPasswordPage.tsx` — route
  `/forgot` (auth shell, no bottom nav): email + recovery code + new password →
  `/home` or `/onboarding`.
- `src/features/profile/YouPage.tsx` — "Recovery code" section: **Generate new
  code** (shown once) so pre-v6 accounts can mint one.
- Restore confirm (You + Auth "Restore from backup") — optional **new password**
  field; blank = keep the backup's password.

### Docs

- New `plans/password-recovery.md` (this file).
- `HANDOFF.md` — auth line: "no recovery" → recovery via code +
  restore-with-new-password; schema note now v6.
- `docs/COMPONENT_MAP.md` — `account` fields, new actions/routes.
- `README.md` — local-auth note.

## Verify

```bash
npm run lint
npm run build
```

Manual:

1. Signup → recovery code shown once → Save → record the code.
2. Log out → wrong-code reset denied with generic error.
3. Correct code + new password → signed in; old password now fails.
4. Pre-existing account (no code): You → Generate new code; then reset works.
5. Export backup (schema 6) → restore **with** a new password → signs in with
   it; recovery fields survive the round-trip.
6. Schema-5 backup still restores (recovery fields NULL, no crash).
7. Existing v5 DB boots through `migrateV5toV6` with data intact.

## Decisions locked

| Area | Decision |
| --- | --- |
| Recovery artifact | Per-account 12-char code, ambiguity-free alphabet, hashed at rest |
| Storage | `recovery_salt` + `recovery_hash` on `account` (PBKDF2-SHA256, 100k iters) reusing `password.ts` |
| Proof | Reset requires email + code; generic error, constant-time verify |
| No-code accounts | Pre-v6 accounts mint a code from You; reset refused until set |
| Restore | `newPassword` option re-hashes the account after import; code round-trips in backups |
| Schema | v6, data-preserving `ALTER TABLE` only |
| Backend | None — serverless per the product constraint |

## Open micro-decisions

- Code length: **12** vs 16 chars (12 is sufficient at 100k PBKDF2 iters).
- Recovery-code modal placement: auth signup step vs an onboarding section.