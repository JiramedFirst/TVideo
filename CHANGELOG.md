# Changelog

## 1.1.0 — 2026-10-08

- **Auto highlight.** `tap` logs each control's box and whether it vanished after the click. `zoom: true` (or
  `ring: true` / `ring: N`) rings that box, and `holdFirst` is inferred, so re-recording after a layout change needs
  no re-measuring. Hand-given `ring {x,y,w,h}` still works.
- **Sync.** The recorder flashes one frame before the first step and `import.mjs` re-times the timeline to it,
  removing the fixture-setup drift between recorded times and the footage.
- `tap` smooth-scrolls off-screen controls itself (no instant jump); `holdFirst` stills and actions start at the
  click, not before an earlier scroll.
- Fixes: hold-still cache keyed on time (toggling `holdFirst` no longer reuses the wrong frame); a step past the end
  of the footage is refused; long captions shrink to fit the band; the contact sheet keeps every frame; the cursor
  also appears in popups; the chime no longer collides with the outro sounds.
- Build writes `captions.srt` / `captions.vtt`. GSAP is bundled, so renders work offline.
- Recorder: `TV_VIEWPORT`, `TV_LOGGED_IN_SELECTOR`, a clear "saved session expired" error, `waitForOtp()`, takes
  auto-copied to `recordings/<timestamp>/`, chromium installed by `npm i`.
- Scripts are Node only, no bash (`new-clip.mjs`, `import.mjs`, `frames.mjs`, `sfx.mjs`); `new-clip.mjs`
  sets up or refreshes a clip project in one command. `TV_MEDIA_USE_DIR` overrides where SFX/TTS are looked up.
- `tests/build.test.mjs`: editor-only test (no browser). CI runs it and `hyperframes check` on the smoke output.

## 1.0.0 — 2026-10-08

- First release as a Claude Code plugin: `/plugin marketplace add JiramedFirst/TVideo`, then
  `/plugin install tvideo@tvideo`.
- **Recorder** (`templates/recorder/`): visible cursor that glides to each control, click ripple, smooth scrolling
  (`glideTo`), per-step timeline + click log, rehearsal mode (`TV_REHEARSE=1`, no video), one-time login via env or a
  saved session, relative dates for booking windows.
- **Editor** (`templates/editor/build.mjs`): footage on a branded 1920×1080 canvas, intro and outro cards, captions
  paced by reading speed or narration, still holds, zoom + highlight ring centred on the control, `holdFirst` for
  controls that navigate away, masks for values that must not ship, click / whoosh / chime SFX, music bed with
  automatic carve under narration. Prints where each step lands in the output for snapshot checks.
- `scripts/`: `import.sh` (all-intra footage for smooth preview seeking), `frames.sh`, `sfx.sh`, `voice.mjs`
  (optional HeyGen narration, regenerates only changed lines).
- `examples/demo-app/` and a smoke test (`tests/smoke.mjs`) that records and builds the example clip; CI runs it.
