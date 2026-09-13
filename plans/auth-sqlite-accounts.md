# Real multi-account auth via SQLite

## Goal

Replace the mock login with real credential storage and verification against
the SQLite DB, scoped per account so each user's data is fully isolated.

---

## 1. Password hashing (`src/lib/password.ts` — new file)

- Use `crypto.subtle.pbkdf2` (built-in, no dependency) with SHA-256.
- Per-user 16-byte salt (`crypto.getRandomValues`), hex-encoded.
- 100k iterations, 256-bit output, hex-encoded.
- Exports: `hashPassword(password, salt)`, `generateSalt()`, `verify(password, salt, hash)`.
- `verify` performs constant-time hex comparison.

---

## 2. DB schema v2 (`src/lib/db/index.ts`)

### Tables

```sql
-- New
CREATE TABLE account (
  email TEXT PRIMARY KEY,       -- lowercased, trimmed
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE session (
  id INTEGER PRIMARY KEY DEFAULT 1,
  active_email TEXT             -- NULL = no one logged in
);

-- Scoped by account_email
CREATE TABLE profile (
  account_email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Umair',
  weight_kg REAL NOT NULL DEFAULT 72,
  height_ft INTEGER NOT NULL DEFAULT 5,
  height_in INTEGER NOT NULL DEFAULT 9,
  step_goal INTEGER NOT NULL DEFAULT 8000,
  onboarded INTEGER NOT NULL DEFAULT 0,
  equipment TEXT NOT NULL DEFAULT '["bodyweight"]',
  trainer_phase TEXT NOT NULL DEFAULT 'pick',
  trainer_day INTEGER NOT NULL DEFAULT 0,
  trainer_body_part TEXT NOT NULL DEFAULT 'legs',
  trainer_goal TEXT NOT NULL DEFAULT 'strength',
  partner_linked INTEGER NOT NULL DEFAULT 0,
  partner_since TEXT,
  streak INTEGER NOT NULL DEFAULT 0,
  steps INTEGER NOT NULL DEFAULT 0,
  calories INTEGER NOT NULL DEFAULT 0,
  workout_done_today INTEGER NOT NULL DEFAULT 0,
  workout_in_progress INTEGER NOT NULL DEFAULT 0,
  plan_source TEXT NOT NULL DEFAULT 'trainer',
  updated_at TEXT NOT NULL
);

CREATE TABLE history (
  account_email TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  date_label TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  calories INTEGER NOT NULL,
  body_part TEXT,
  rest INTEGER,
  sessions INTEGER,
  PRIMARY KEY (account_email, date)
);

CREATE TABLE plan (
  account_email TEXT NOT NULL,
  uid TEXT NOT NULL,
  exercise TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER,
  seconds INTEGER,
  PRIMARY KEY (account_email, uid)
);

CREATE TABLE partner (
  account_email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Rae',
  streak INTEGER NOT NULL DEFAULT 0,
  steps INTEGER NOT NULL DEFAULT 0,
  calories INTEGER NOT NULL DEFAULT 0,
  last_workout TEXT NOT NULL DEFAULT '',
  history TEXT NOT NULL DEFAULT '[]',
  partner_linked INTEGER NOT NULL DEFAULT 0,
  partner_since TEXT
);
```

### Migration strategy

Use `PRAGMA user_version` (current = 0):

- On version < 2: `DROP TABLE IF EXISTS` all five tables, recreate, set `user_version = 2`.
- This wipes current device demo data — acceptable since it is all seed/prototype data.
- `migrateLegacy` and `remapSessionName` are removed (legacy accounts lack a password; cannot be recovered).

### New db exports

- `createAccountRow(email, passwordHash, salt)` — inserts `account`, seeded `profile`, and seeded `partner` rows.
- `verifyCredentials(email, password)` → `boolean` — looks up account, hashes, constant-time compares.
- `getSession()` → `string | null` — reads `session.active_email`.
- `setSession(email)` / `clearSession()`.
- All `load*`/`save*` take an `accountEmail: string` param, scoped to their rows.

---

## 3. Store (`src/lib/store.tsx` + `src/lib/store-hooks.ts`)

### store-hooks.ts

```
createAccount: (email: string, password: string) => Promise<{ok: boolean; error?: string}>
logIn:         (email: string, password: string) => Promise<{ok: boolean; error?: string; dest?: '/home' | '/onboarding'}>
signOut:       () => Promise<void>
```

`continueWithGoogle` removed.

### store.tsx

- **hydrate**: `db.getSession()` → if active email exists, load that account's
  profile/history/plan/partner → compose `AppState` (signedIn: true). If no
  session, start with `seedState` (signedIn: false, seeded defaults).

- **createAccount** (async):
  1. Validate email (`@`) + password (≥6), normalize.
  2. `db.verifyCredentials` or check existence → reject if taken.
  3. `db.createAccountRow(email, hash, salt)`, `db.setSession(email)`.
  4. Commit with `signedIn: true, accountEmail, onboarded: false`, seeded defaults.

- **logIn** (async):
  1. `db.verifyCredentials(email, password)` → reject if wrong / not found.
  2. `db.setSession(email)`, load profile/history/plan/partner for that email.
  3. Commit full `AppState`, dest = onboarded ? '/home' : '/onboarding'.

- **signOut** (async):
  1. `db.clearSession()`.
  2. Commit `signedIn: false` (account data stays in DB; not deleted).

- All `persist*` helpers pass `state.accountEmail` into db calls (guarded:
  no-op if null, which only happens in unsigned-in state).

---

## 4. UI (`src/features/auth/AuthPage.tsx`)

- `submit` becomes `async`; call `await` on `createAccount`/`logIn`.
- While pending: disable the submit button + set a `submitting` loading flag.
- Remove the `continueWithGoogle` button and `GoogleMark` component entirely.
- No other page changes (Shell / YouPage / onboarding remain the same).

---

## 5. Verify

```bash
npm run lint
npm run build
```

Manual test path:

1. Fresh launch → Sign up with email A + password → onboard → full session.
2. Kill app / relaunch → session restored, data intact.
3. Sign out → sign in with email B → isolated data (no overlap with A).
4. Wrong password → rejected. Duplicate email → rejected.
5. Second account on same device gets its own history/calendar/partner.

---

## Risks

- `crypto.subtle` requires a secure context. Works on the installable PWA
  (HTTPS, e.g. Netlify/Vercel) and `localhost` dev, but fails over plain
  `http://` LAN phone browser. Low risk since the PWA is served over HTTPS.
- Upgrade wipes current device demo data (acceptable; see migration above).
  If preservation is needed later, implement a column-ALTER path before
  drop-recreate.
