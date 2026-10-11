# Rest countdown: next-up preview + sound/vibration cues

Fixes issue #37 ("Show next exercise and add sound cue during rest"). During rest the session shows the **Next Up** exercise with the countdown; the last 10 seconds add an audio countdown (beep per second) plus vibration per second, and the next exercise's animation GIF appears. A per-account **Settings toggle** turns the sound off; vibration stays always on.

## Goal

- At rest, show the next exercise (name, cue, set indicator) labeled **Next Up** with the rest countdown.
- For `restLeft ≤ 10`: play a tick beep + vibrate once per second; show the next exercise's animation GIF when it has one (otherwise its coach pose). Moves with a GIF also show it above 10s.
- Sound cues are backed by a Settings toggle on the You page (per-account, persisted); vibration is unconditional.

## Decisions (confirmed)

- **Sound default = ON** (new users keep current behavior).
- **Audio = Web Audio API synthesis** (`OscillatorNode`) — no binary assets, works offline (PWA requirement). Lazily-created/resumed shared `AudioContext`; missing/suspended contexts are guarded.
- **Vibration = `navigator.vibrate(100)`** per second in the last 10 seconds, always on, feature-guarded (iOS Safari silently no-ops).
- **GIF swap boundary = `restLeft ≤ 10`**, same threshold as the tick cues so visual + audio stay in sync.
- **Next Up logic:** last set of the current move (`pendingAdvance`) → next move `session[index + 1]` set 1; otherwise same move, set `setNo + 1`.
- **Toggle placement:** new **Settings** section on the You page; applies immediately (no Save button), persisted via the normal debounced profile write.

## Changes

### 1. Persistence — `src/lib/db/index.ts`, `src/lib/store.tsx`, `src/lib/types.ts`, `src/lib/backup.ts`

- Bump `SCHEMA_VERSION` 8 → 9; add `migrateV8toV9()` (`ALTER TABLE profile ADD COLUMN sound_on INTEGER NOT NULL DEFAULT 1`, guarded by `columnExists('profile', 'sound_on')`), wired into `createSchema()` for `version < 9`.
- Add `soundOn: boolean` to `ProfileData` + `defaultProfileData()` (default `true`); thread `sound_on` through `profileInsertStatement`, `rowToProfile` (absent column → `true`), and `saveProfile`.
- Store: add `soundOn` to `AppState`/seed state, load from profile, pass through `persistProfile`, expose `setSoundOn(soundOn: boolean)` (immediate-commit action, same pattern as `updateProfile`). Add `soundOn` + `setSoundOn` to `StoreValue`/`useStore`.
- Backup: bump `BACKUP_SCHEMA` to 9 and add `9` to `SUPPORTED_BACKUP_SCHEMAS` (exports write `SCHEMA_VERSION`, so restores must accept it); `parseBackup` defaults `profile.soundOn ??= true` so schema ≤8 backups restore with sound on.

### 2. Settings UI — `src/features/profile/YouPage.tsx` + new `src/components/ui/Switch.tsx`

- New small `Switch` component (none exists today) — label + track/thumb, `checked`/`onChange` props.
- New `Section title="Settings"` on YouPage with a **Sound** row: label "Countdown sound", helper copy *"Beep during the last 10 seconds of rest. Vibration stays on."* Toggling calls `setSoundOn` immediately.

### 3. Session — `src/features/workout/SessionPage.tsx`

- Pull `soundOn` from `useStore()`.
- Compute the next-up move (per Decisions) and render a **Next Up** card during `phase === 'rest'`: label, next exercise name + cue, `Set X / Y`, with the rest countdown `Timer` attached.
- Animation in the main stage is GIF-first (`ExerciseVisual`): `exerciseGif(...)` when the move has a dataset clip, otherwise `CoachAvatar`.
  - `restLeft > 10` → the current exercise's GIF, or the rest-pose coach when no clip.
  - `restLeft ≤ 10` → the next exercise's GIF, or its coach pose when no clip.
  - Session end (`phase === 'done'`) → the SVG celebrate loop always; GIFs are skipped.
- Countdown cues in the existing rest effect:
  - `10 ≥ restLeft > 0` → `playTick()` + `vibrate(100)` each second.
  - `restLeft ≤ 0` → `playGo()` + longer `vibrate(200)` alongside the existing `pulse` animation.
  - Audio calls are gated by `soundOn`; vibration always runs.

### 4. Cue helpers — new `src/lib/sound.ts`

- `playTick()` — short low beep.
- `playGo()` — higher/longer beep at the rest→work transition (the "cue when next exercise starts" from the issue).
- `vibrate(ms)` — `navigator.vibrate` with a `'vibrate' in navigator` guard.

## Notes / risks

- Resume-from-persisted-rest is unaffected: `restLeft` loads from `workingWorkout.restSeconds`, so the 10s segment, GIF swap, ticks, and vibration all fire correctly on resume.
- Web Audio needs a user gesture; sessions start/resume from taps, and the shared context is resumed lazily (`resume()` on `suspended`).
- No settings toggle for vibration per the requirement — always on.
- Schema bump is data-preserving (one `ALTER TABLE`, defaulted column); legacy backups still restore with sound on.

## Verification

- `npm run lint` + `npm run build` (tsc strict) green.
- Manual: finish a set → Next Up card during rest; the current move's GIF (coach when no clip) until 10s, then the next move's GIF + ticking beep/vibration per second; auto-advance fires with `playGo()`.
- Toggle off → rest is silent but still vibrates; toggle on → beeps return; setting survives reload.
- Export → restore round-trips schema 9; a schema 8 backup restores with sound on.
- Offline smoke test (no external audio assets).

## File checklist

- New: `src/lib/sound.ts`, `src/components/ui/Switch.tsx`, `plans/rest-countdown-cues.md`
- Modified: `src/lib/db/index.ts`, `src/lib/store.tsx`, `src/lib/types.ts`, `src/lib/backup.ts`, `src/features/profile/YouPage.tsx`, `src/features/workout/SessionPage.tsx`