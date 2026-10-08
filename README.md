# TVideo

**English** · [ภาษาไทย](README.th.md)

[![smoke](https://github.com/JiramedFirst/TVideo/actions/workflows/smoke.yml/badge.svg)](https://github.com/JiramedFirst/TVideo/actions/workflows/smoke.yml)

Claude Code plugin that makes tutorial videos for a web app. It records the real screens with Playwright, with a
visible cursor and readable pacing, then edits them with Hyperframes: captions, a zoom and highlight on each control
to press, click sounds, and music. The result is a 1080p MP4 per task.

[![Demo video: a tutorial made by TVideo from the demo app](docs/images/demo.gif)](https://github.com/JiramedFirst/TVideo/releases/latest/download/TVideo-demo.mp4)

![A step with the zoom and highlight ring on the button to press](docs/images/hero.png)

## Install

```
/plugin marketplace add JiramedFirst/TVideo
/plugin install tvideo@tvideo
```

## Use

Run your app (staging or local) with a demo account, then ask Claude:

> Make a tutorial video showing how a customer creates an order on staging.example.com.

Claude splits the request into one clip per task and agrees the list with you. For each clip it writes a Playwright
script and rehearses it without recording to prove every selector. Then it records and builds the edit; the
recorder logs where every clicked control sits, so highlights need no pixel measuring. You get a draft to review,
then the final render in `<work>/clip-NN/renders/`, with `captions.srt` / `.vtt` next to it.

When the UI changes, ask it to re-record a clip. The edit is generated from the recording's step timeline and click
log, so the captions, zooms, highlights and click sounds follow the new footage without hand editing.

Captions work in any language. A Thai font is bundled. Rendering is fully local; a HeyGen account is only needed for the optional narration. Stuck? See [troubleshooting](plugin/skills/tvideo/references/troubleshooting.md).

## Requirements

- Node 20.11+ and ffmpeg.
- Hyperframes skills: `npx hyperframes skills update general-video`. This also installs the sound effects.
- Playwright + chromium in the recorder folder: `npm i` (installs chromium too).

## Passwords and safety

The recorder reads credentials from environment variables only (`TV_USERNAME`, `TV_PASSWORD`). For SSO or captcha
logins, sign in once by hand and save the session (`npx playwright codegen --save-storage=.auth/state.json <url>`).

Recording drives the app for real: forms submit and emails go out. Use staging and a fictional demo account.
Claude asks before recording against a shared environment and never completes a real payment. It can mask on-screen
values in the edit. Tutorial videos get passed around, so keep real customer data off screen.

## Demo

`examples/demo-app/` is a small static app, and the plugin's example clip and plan are written for it.

| Choosing from a dropdown | The result after saving |
|---|---|
| ![](docs/images/step-dropdown.png) | ![](docs/images/step-result.png) |

The smoke test serves the demo app, rehearses and records the example clip, imports it, builds the edit and runs
`hyperframes check`. A faster editor-only test needs no browser. CI runs both:

```bash
node tests/build.test.mjs
node tests/smoke.mjs
```

## License

MIT. The bundled font (OFL), music (CC BY 4.0) and GSAP keep their own licenses: see [THIRD_PARTY.md](THIRD_PARTY.md).
