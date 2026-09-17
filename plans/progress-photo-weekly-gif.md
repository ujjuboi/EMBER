# Progress photos → weekly GIF

## Goal

After each completed workout, prompt a progress photo. When the last 7 days hold 2+ photos, a gallery on the You page automatically generates an animated GIF of them ("this week's progress wave") that can be previewed and downloaded.

## Decisions (confirmed)

- **Capture:** real capture via hidden `<input type="file" accept="image/*" capture="user">` (opens phone camera; desktop file picker fallback) → canvas-normalized square 640px JPEG (q≈0.7) → data URL. "Skip" always offered.
- **Persistence:** photos live in the on-device SQLite DB (`src/lib/db/index.ts` — SQLite persistence has landed per `docs/persistence.md`). Add a `photos` table keyed by `account_email`, and carry data URLs through the existing `save`/`load` funnel.
- **Surface:** new **Progress** section on the You page — full-week photo history + auto-generated GIF once eligible.
- **GIF encoder:** `gifenc` (tiny MIT, pure JS with own types, no wasm) — frames drawn to an offscreen canvas, RLE/quantized, ~400–600ms per frame.

## Changes

### 1. Data model — `src/lib/types.ts` + `src/lib/store.tsx`

- Add `ProgressPhoto { date: string; dataUrl: string; takenAt: number }`.
- Add `photos: ProgressPhoto[]` to `AppState`; seed as `[]`; carry it untouched through load/persist.
- New store action `saveProgressPhoto({ date?, dataUrl })` (defaults to today, replaces same-day entry — mirrors the 1-row-per-workout-day rule). Signature added to `StoreValue` and `useStore`.

### 2. Capture flow — `src/features/workout/SessionPage.tsx`

- Rework `finish()`: keep the 1.4s celebrate animation, but instead of navigating inline, show a bottom-sheet `PhotoPrompt` (overlay pattern from `TimelinePicker`/`Confirm.tsx`):
  - "Snap a progress photo" + **Take photo** (triggers file input) + **Skip**.
  - On photo: read file → downscale/compress (`src/lib/photo.ts`) → `saveProgressPhoto` → `finishWorkout(...)` → `navigate('/home')`.
  - On skip: same without saving. Existing `finishTimeoutRef` cleanup stays.
- New helper `src/lib/photo.ts`: `fileToSquareJpeg(file, { size = 640, quality = 0.7 })` with a generated-size guard (re-compress at lower quality if > ~150KB so a week stays small in IndexedDB/SQLite).

### 3. GIF generation — `src/lib/gif.ts` (new, `npm i gifenc`)

- `loadFrame(dataUrl, size)` → offscreen canvas → `getImageData`.
- `quantize(data, 256, { format: 'rgb565' })` + `applyPalette` (dither) → `GIFEncoder` → `writeFrame(frame, 500)` per photo → `finish()` → `Blob` → `URL.createObjectURL`.
- Revoke the previous blob URL before each new generation (no leaks). Photos ordered by date.

### 4. Progress gallery — `src/features/progress/ProgressGallery.tsx` (new, mounted on `YouPage` below Equipment)

- Section "Progress": grid of thumbnails for photos dated `today − 6 … today` (tap → fullsheet viewer).
- Empty state: "Photos appear after each workout."
- If ≥2 photos in the window: auto-generate the GIF on mount and render it as an animated `<img>` with a **Download** (`<a download="ember-progress-wave.gif">`) button. This matches "after a week it creates a gif" with zero extra taps.

## Notes / risks

- One photo per workout **day** (replacing on repeats) — keeps the week window clean; multiple sessions a day share the slot.
- GIF blob lives in memory only (not persisted); regenerating on open is cheap for ≤7 frames.
- No binary assets added to the repo — consistent with the "no GIF files" stance (output is the generated GIF, not committed assets).
- Blob data URLs are persisted through SQLite (`src/lib/db/index.ts`), no raw binaries in the repo; the old `sessionStorage` 5MB ceiling no longer applies.

## Verification

- `npm run lint` + `npm run build` (tsc strict) green.
- Manual: finish a session (seed some history if needed) → capture/skip → photo lands in You → 2+ photos → GIF renders and downloads.

## File checklist

- New: `src/lib/gif.ts`, `src/lib/photo.ts`, `src/features/progress/ProgressGallery.tsx`
- Modified: `package.json`, `src/lib/types.ts`, `src/lib/store.tsx`, `src/features/workout/SessionPage.tsx`, `src/features/profile/YouPage.tsx`
