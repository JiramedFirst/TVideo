# Editing reference (`build.mjs`)

## Inputs

- `tvideo.config.json` — brand (`bg`, `bg2`, `glow`, `accent`, `onAccent`, `ink`,
  `captionBg`), `font.family` + `font.files` (weight → file), `logo`, `logoAlt`,
  `music {src, volume, credit}` or `null`, `sfx` (false to disable), `lang`,
  `readingCharsPerSec` (≈12 Thai, ≈15 English).
- `plan.json` — `title`, `subtitle`, `footage`, `outro {title, line}`, and
  `steps[]` in the same order as the recorder's `tl.step`s.
- `timeline.json`, `clicks.json` — from the recorder via `scripts/import.sh`.
- `voices.json` — optional, from `scripts/voice.mjs`.

## Timing model

Each step plays its recorded source range, then holds a still until the longest of:

- the action itself (+0.2 s, or +2.4 s when the step has a `ring`),
- the caption's reading time (`chars / readingCharsPerSec + 1 s`),
- the narration line (+lead/breath), when voices exist.

So silent clips are snappy, narrated clips wait for the voice, and rings always
stay long enough to be found.

## Step options

| Key | Use |
|---|---|
| `caption` | Required. Short instruction the viewer reads. |
| `holdFirst: true` | The control disappears once clicked (navigates away). Shows the frame **before** the click (0.35 s before the step) while zoom/ring point at it, then plays the click. |
| `zoom {scale=1.5, at=0.3, x?, y?}` | Punch-in at `at` s into the step; eases back out at the step end. The zoom's fixed point defaults to the ring centre — leave x/y out unless there is no ring. Any point P moves to `O + (P − O) × scale`, so a control away from the origin O slides toward the edge and can be cropped. |
| `zoom.ring {x, y, w, h}` | Accent ring centred on the control (w×h = its size). Shown only over the still, never while the video plays (the page changes under it). |
| `mask {x, y, w, h, text, after, align, fontSize, bg, color}` | Covers text that must not ship (test ids, real names) with a look-alike box. `after` = seconds into the step when the text appears. |
| `chimeAfter` | Seconds into the step to play a success chime (e.g. when a "Saved" dialog appears). |

All coordinates are in the **recording's pixel space** (the size of
`assets/footage.mp4`, normally 1280×800). Measure them from full-size frames
(`scripts/frames.sh`), not from the scaled contact sheet.

## Finding the right moment

`timeline.json` gives each step's `startMs/endMs`. Clicks land near the start of a
step. To find when something appears (a dialog, a toast), detect scene changes:

```bash
ffmpeg -hide_banner -ss <stepStart> -i assets/footage.mp4 -vf "select='gt(scene,0.03)',showinfo" -f null - 2>&1 | grep -oE "pts_time:[0-9.]+"
```

Add `stepStart` back to each time; `after = appearTime - stepStart`.

## Verify, don't assume

After `node build.mjs` and `npx hyperframes check`, take snapshots at every ring,
mask and step midpoint (`npx hyperframes snapshot --at …`) and look at them. The
two classic misses: a ring on the wrong page (the control was clicked earlier than
you thought — use `holdFirst`), and a still that shows the *next* step (the click
landed exactly on the boundary; the build already samples 0.2 s early, move the
step boundary in the spec if needed).

## Music

Bundled: "Happy Beats / Business Moves Vol. 12" by ende.app, CC BY 4.0 (credit is
printed on the outro from `music.credit`). Keep it quiet (`volume` 0.15–0.25). With
narration, `build.mjs` runs the Hyperframes carve automatically (dips the bed under
the voice); it needs `npm i -D @hyperframes/core` in the clip project.
