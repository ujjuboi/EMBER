# NOTICE

## Third-party data & assets

### Exercise dataset — `hasaneyldrm/exercises-dataset`

The supplemental exercise library (`src/data/ingested/exercises.json`, 1,304
moves) is derived from the
[`hasaneyldrm/exercises-dataset`](https://github.com/hasaneyldrm/exercises-dataset)
(1,324-exercise dataset), released under the MIT License.

Exercise metadata, multilingual instruction text, and dataset structure are MIT
licensed. The original media (animation GIFs and 180×180 thumbnails) is
© [Gym visual](https://gymvisual.com/), redistributed with permission.

- Per-record `attribution` strings of the form
  `© Gym visual — https://gymvisual.com/` are preserved on ingested records and
  surfaced in the app's exercise-library attribution footer.
- EMBER does not ship the GIFs. Where derived SVG coach art is generated from
  a dataset GIF, this NOTICE and the per-record attribution remain attached
  (see `src/coach/poses/generated/`).
- Reuse of the original media is governed by Gym visual's
  [Terms & Conditions](https://gymvisual.com/content/3-terms-and-conditions-of-use);
  obtain your own license there before reusing the media.