# Changelog

## Unreleased

- Safety: Phase 1 now checks the seeds/fixtures behind the recorded screens for real personal data and seeds a
  fictional dataset for the recording (#13).
- Shortcuts `/tvideo setup | record | dub`: preflight only, a clip without narration, or narration on an existing
  clip (rendered next to the captions-only one). Any other argument keeps the full flow (#14).
- `theme` presets (`navy`, `purple`, `teal`, `blue`) fill `brand`; `brand.glowAt` / `brand.glow2` place the two
  background glows in canvas pixels to match a reference frame (#12).
- The built composition passes `npx hyperframes check` with no findings: intro, each step and outro are
  sub-compositions in `compositions/`, the intro title is on screen at 0 s (thumbnail), the music credit is 28 px and
  voice clips form one carve group (#10).
- `voice.mjs --engine google` reads the key from `~/.config/tvideo/google-tts.env` (or `TV_ENV_FILE`) when
  `GOOGLE_TTS_API_KEY` isn't set, and warns if that file is readable by others; `narration.md` documents it and
  `node --env-file` (#8).
- Recorder `teardown.ts` saves every clip folder this run filmed (`video.webm` + `timeline.json`) from each project's
  `outputDir`, whatever its name, into `recordings/` next to the config (or `TV_RECORDINGS_DIR`, relative to the config),
  and warns about a filmed clip with no video; `recording.md` explains running the clips inside an existing Playwright
  project with its own login fixtures. Test: `tests/teardown.test.mjs` (#9).
- `voice.mjs --only <id>` / `--sample "<text>"` generate one line to listen to before generating them all;
  `--sample` writes one file per voice, `--only` is cached for the full run and refreshes only its own entry of an
  existing `voices.json` (#11).

## 1.2.0 — 2026-10-16

- Narration via Google Cloud Text-to-Speech: `voice.mjs --engine google --voice <name>` (key in
  `GOOGLE_TTS_API_KEY`), `--list` to browse voices. HeyGen stays the default. Test: `tests/voice-google.test.mjs`.

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
