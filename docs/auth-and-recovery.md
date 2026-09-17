# Accounts, auth & password recovery

Auth is **local-only** — there is no server, no OAuth, no email verification
beyond the `@` check. `crypto.subtle` (used for hashing) requires a secure
context: `localhost` and the HTTPS production site are fine; plain `http://` on a
LAN phone is not.

## Local accounts

- Signup hashes the password with **PBKDF2-SHA256** (`src/lib/password.ts`),
  100k iterations, per-user 16-byte salt, constant-time comparison.
- Login verifies against the DB; a `session` row holds the active account, so a
  reload restores the signed-in user. `signOut` clears the session (and the plan)
  but keeps the profile, so logging back in resumes onboarding vs. home correctly.
- Validation: email must contain `@`, password ≥ 6 chars.
- All tables are scoped per account — multiple local accounts on one install are
  fully isolated.

This is **UI-level local gating, not server-grade security**: anyone with access
to the device's browser storage can read the data, and at-rest storage is
unencrypted in the browser sandbox.

## Offline password recovery

There is no server account registry, so classic email-reset links cannot work.
Each account instead mints a **one-time recovery code**:

- **12 characters** from an ambiguity-free 32-symbol alphabet (`A-Z` + `2-9`,
  minus `I L O 0`) — ~60 bits of entropy.
- Stored **hashed at rest** (`recovery_salt` + `recovery_hash` on `account`,
  reusing the PBKDF2 machinery) — a DB read leaks nothing usable.
- **Shown once** at signup in a modal; never re-displayed. It can be regenerated
  from the You page (a confirm warns the old code is invalidated). Pre-recovery
  accounts mint a code there too — reset is refused until one is set.

### Reset flow (`/forgot`)

Email + recovery code + new password. Validation and reset are identical to
signup; the code is verified with a constant-time compare. Either a wrong code
or an unknown email produces the same generic "No account for that email, or
wrong code" — the UI never reveals which. After a confirmed reset the user
returns to login; reset never signs anyone in silently.

### Restore with a fresh password

Backup restore accepts an optional **new password**: after the backup rows are
imported, the account's password hash is reset so the fresh password (not the
backup's unknown hash) is active, then you sign in with it. Backup schemas that
predate recovery restore with the recovery fields defaulted to `NULL`.