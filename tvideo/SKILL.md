---
name: tvideo
description: Turn a real web app into polished how-to / tutorial videos — Playwright records the actual UI with a visible cursor, then a Hyperframes edit adds an intro card, step captions (any language, Thai included), zoom + highlight ring on the control to press, click sounds, music and optional TTS narration, rendered to 1080p MP4. Use this whenever someone wants a tutorial video, how-to video, training video, onboarding video, walkthrough, user guide video or "วิดีโอสอนใช้งาน / คลิปสอน / วิดีโอแนะนำการใช้งานระบบ" of a website or web app, wants to replace live user training with downloadable videos, or wants to re-record such videos after the UI changed — even if they don't say "Playwright" or "Hyperframes".
---

# TVideo — tutorial videos from a real web app

You are producing short videos that teach end users how to do one task in a web
app. The viewers are not technical: every frame must be calm, readable and real.
The pipeline has two halves that meet at three files:

```
recorder (Playwright)  ──►  video.webm + timeline.json + clicks.json  ──►  editor (Hyperframes)  ──►  MP4
```

- **Recorder** (`templates/recorder/`) drives the real app, draws a visible
  cursor, and logs when each step starts/ends and when every click lands.
- **Editor** (`templates/editor/build.mjs`) lays the footage on a branded canvas,
  holds a still wherever the viewer needs time to read, zooms + rings the control
  to press, puts a click sound on every click, and renders.

Because the edit is generated from those files, a re-record after a UI change is
just: record → import → build → render. Keep it that way — never hand-edit
`index.html`; change `plan.json` / `tvideo.config.json` and rebuild.

## Phase 0 — Preflight

Run these checks at the start of every session — alongside your first reply if
you are asking brief questions, so the user isn't kept waiting — and fix gaps
before recording; a missing tool found mid-recording wastes a take.

| Need | Check | Fix |
|---|---|---|
| Node ≥ 20 | `node -v` | install Node |
| ffmpeg / ffprobe | `ffmpeg -version` | `brew install ffmpeg` / apt |
| Hyperframes CLI + skills | `npx hyperframes --version` | `npx hyperframes skills update general-video` (also installs `media-use`, `hyperframes-audio`) |
| Chromium for Playwright | in the recorder dir: `npx playwright install chromium` | — |

Read `references/hyperframes-notes.md` once if you have not used Hyperframes in
this session (composition rules the build script already follows, and why).

## Phase 1 — Brief (ask, don't assume)

Collect, in one short round, what changes the work:

1. **App URL** and environment. Prefer a staging/UAT/demo environment. Recording
   drives the app for real: forms submit, records get created, emails go out.
   Say this plainly and get a yes before recording against anything shared.
2. **Login**: a dedicated *demo* account (username/password via env vars — never
   pasted into chat or written to files). If login needs OTP/2FA, plan for the
   user to paste the code during the run (see `references/recording.md`).
3. **The flows**: one video per task. Split "how to use the system" into clips of
   30–120 s each (sign in, create X, edit/cancel X, download Y…). Ask for the
   order the viewer should watch them in.
4. **Language** of the UI and captions (`TV_LOCALE`, `lang`).
5. **Brand**: logo file, 1–2 colors, font if the language needs one (bundled
   IBM Plex Sans Thai covers Thai + Latin). Defaults are a neutral navy/green.
6. **Audio**: captions + click SFX are the default. Music: bundled CC BY track or
   none. Narration is optional and costs TTS quota — see `references/narration.md`.

### Safety decisions (settle these in the brief, before any recording)

These videos get distributed, and recording performs real actions. Explain the
trade-off, recommend the safe option, and let the user decide — then follow it.

- **Whose data is on screen.** Nothing the audience must not see: other customers'
  names, real orders, personal emails/addresses/phone numbers, internal test
  labels. Recommend a fictional demo account. If the user insists on a personal or
  real account, say exactly what will be visible, get an explicit OK, and plan
  `mask`s for every personal value (check them on snapshots). If you're unsure
  whether a value is real, ask.
- **Irreversible or financial steps** (pay, transfer, send to a real third party,
  delete, publish). Never complete a real payment or other irreversible action
  just to film it. Prefer a sandbox/test mode (test card, staging gateway); if
  there is none, record up to the final confirmation screen, stop there, and let
  the last caption explain the final click. Say this in the brief.
- **Production vs staging.** Recording on a live production site needs an explicit
  yes *after* you've listed what it will create (orders, emails, stock changes)
  and how it will be cleaned up. Prefer flows that are read-only or reversible there.
- **Credentials.** Passwords and OTPs go in env vars / a local file the user
  controls, never in chat or in files you create. A username/email the user
  already typed is not a secret, but don't repeat it into files beyond `TV_USERNAME`.
- **Third-party sign-in (Google, Microsoft, SSO, captcha).** Automated login there
  usually hits bot checks or 2FA. Have the user sign in once by hand in a headed
  browser (`npx playwright codegen --save-storage=.auth/state.json <login URL>`),
  then record with that saved session and leave `TV_USERNAME` unset.
- **Publishing.** Before delivering, re-watch for personal data, and keep the
  music credit on the outro (CC BY requires attribution). Public pages are a
  stricter audience than internal training — apply the privacy rules strictly.

## Phase 2 — Discover and rehearse

1. Create a working folder per project, e.g. `tvideo-work/<app>/`, then copy
   `templates/recorder/` → `recorder/` and `npm i` there.
2. **Discover**: open each page of a flow (Playwright MCP / browser tools, or a
   throwaway script) and pick stable selectors — prefer roles/labels/test-ids
   over CSS classes. Note things that won't film well (see recording.md: native
   `<select>` popups, date pickers, instant scroll jumps, booking windows).
3. Write one spec per clip in `recorder/clips/NN-name.spec.ts`, following
   `clips/01-example.spec.ts`: `createTimeline` first; each viewer-visible step
   is `tl.step('<caption text>', …)` ending in an `expect`; clicks via
   `tap()`/`typeInto()`; `glideTo()` before anything below the fold; `hold()`
   after key moments; `await tl.save()` last. Pick values the way a user would —
   choose from dropdowns/calendars rather than typing codes.
4. **Rehearse**: `TV_REHEARSE=1 npx playwright test` — no video, no pauses. Fix
   every failure here; it costs seconds instead of a ruined take.

## Phase 3 — Record

`npx playwright test` (or one clip: `npx playwright test clips/02-`). Each clip
writes `video.webm`, `timeline.json`, `clicks.json` under
`test-results/<clip>/`. **Copy them out immediately** (next step does) —
Playwright wipes `test-results/` on the next run.

A failing step means the app did something unexpected (validation, a business
rule, slow load). Read the failure screenshot, fix the spec or the data, re-run
that clip. Never loosen an assertion just to get a take; a green take of a broken
flow teaches users the wrong thing.

## Phase 4 — Set up the edit

One Hyperframes project per clip, next to the recorder (e.g. `tvideo-work/<app>/clip-02/`).
`hyperframes init` writes its own starter files; copying the template over them is
intended (`build.mjs` regenerates `index.html`). Run from the work folder:

```bash
npx hyperframes init clip-02 --non-interactive --example=blank
cp -R <skill>/templates/editor/. clip-02/
cp clip-02/tvideo.config.example.json clip-02/tvideo.config.json   # brand, font, logo, music, lang
cp clip-02/plan.example.json clip-02/plan.json                     # title, outro, one step per tl.step
ls recorder/test-results/                                          # the clip's folder name is long — find it here
bash <skill>/scripts/import.sh recorder/test-results/<that-folder> clip-02
bash <skill>/scripts/sfx.sh clip-02                                # click-soft, whoosh-short, chime, sparkle
```

In `tvideo.config.json`: set `lang` and `readingCharsPerSec` (≈15 English, ≈12
Thai — slower scripts read slower), the brand colours, and `logo` (a path, or
`null` for text-only cards). Keep `music.credit` — the bundled track is CC BY.

`plan.json` steps map **1:1, in order** to the recorder's `tl.step`s (the build
refuses a mismatch). Captions in plan.json are what the viewer reads — keep them
short instructions ("Click “Save”"), not narration. Usually the `tl.step` labels
are already good captions; copy them over.

## Phase 5 — Measure, build, check

1. Pull frames to find coordinates: `bash <skill>/scripts/frames.sh assets/footage.mp4 frames <t1> <t2> …`.
   Good times: each click in `clicks.json` minus ~0.3 s (the cursor is already on
   the control — that's its position), and each step's `endMs` minus 0.3 s (the
   settled result). Read the full-size PNGs. Coordinates are in the *recording's*
   pixels (e.g. 1280×800).
2. Add per step as needed (details in `references/editing.md`):
   - `zoom {scale,at}` + `ring {x,y,w,h}` on the control to press — the zoom
     centres on the ring (the fixed point of a zoom must be on the control, or the
     control slides toward the edge and gets cropped);
   - `holdFirst: true` when the control disappears once clicked (a button that
     navigates away) — shows the pre-click frame first;
   - `mask {x,y,w,h,text,after}` to cover a value that must not ship;
   - `chimeAfter: <s>` for a success moment.
3. `node build.mjs` then `npx hyperframes check`. Fix every error; contrast
   warnings during a caption's fade-in are expected and harmless.
4. Verify with your own eyes: `build.mjs` prints where each step lands in the
   OUTPUT timeline (output time ≠ recording time — the intro and holds shift it).
   Snapshot inside those windows — `npx hyperframes snapshot --at <t…> --no-end`,
   one inside each still that has a ring, each mask, each step midpoint — and read
   the contact sheet. Rings must sit on the control, masks must cover exactly,
   captions must match what is on screen.

## Phase 6 — Review and render

1. Open a preview: `npx hyperframes render --quality draft -o renders/draft.mp4`
   and `open` it (Studio preview `npx hyperframes preview --background` also
   works, but its seeking can stutter on long clips; the render never does).
2. Iterate on feedback by editing plan/config and rebuilding — or re-recording
   when the footage itself is wrong (pacing, a jump, wrong data). Fix footage
   problems at the source, not with overlays.
3. Final: `npx hyperframes render --quality delivery -o renders/<clip-name>.mp4`.
   Report path, duration and size.
4. Clean up what the recording created in the app (demo orders/bookings) if the
   environment is shared, and say what you cleaned.

## When something goes wrong

`references/troubleshooting.md` lists the failures this pipeline has already hit
and their real causes (footage/timeline drift, native selects, booking windows,
clobbered test-results, SFX overlap lint, stutter in preview). Check it before
debugging from scratch.

## Files in this skill

- `templates/recorder/` — Playwright project: `cursor.ts`, `timeline.ts`,
  `auth.setup.ts`, `playwright.config.ts`, `clips/01-example.spec.ts`
- `templates/editor/` — `build.mjs`, `plan.example.json`,
  `tvideo.config.example.json`, `assets/fonts` (OFL), `assets/music` (CC BY)
- `scripts/` — `import.sh`, `frames.sh`, `sfx.sh`, `voice.mjs` (optional TTS)
- `references/` — `recording.md`, `editing.md`, `narration.md`,
  `hyperframes-notes.md`, `troubleshooting.md`
