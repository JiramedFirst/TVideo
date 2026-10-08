# Changelog

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
