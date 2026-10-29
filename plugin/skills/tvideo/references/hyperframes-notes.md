# Hyperframes notes (what build.mjs already respects)

You rarely need to touch the generated HTML. If you extend `build.mjs`, keep these
rules — each one is a real failure the template already avoids:

- **One scene per sub-composition.** `index.html` holds the background, the glow
  tween (`window.__timelines['main']`), every `<audio>` and one host per scene;
  the root `data-duration` is the render length. The intro, each step and the
  outro are `compositions/<id>.html` (`intro`, `step-<step id>`, `outro`):
  everything inside `<template>`, host id = scene root id = timeline key. Both
  files are generated — edit `build.mjs`, `plan.json` or the config, never them.
- **Scene time is local**: 0 is the host's `data-start`, so every `data-start`
  and tween position inside a scene subtracts the step start. Use `fromTo`
  (never `from`); a second `fromTo` on the same target takes
  `immediateRender: false`. Ids are unique across the page (`zoom-s02`,
  `cap-s02`) and the scene root is styled by its id, never a class.
- **Never nest a timed `<video>` inside a timed element.** The footage stage
  (`stage-wrap-<id>`) is untimed; the first step's scene fades the stage in and
  the last one fades it out. Only the `<video>`/`<img>` clips carry
  `data-start`/`data-duration`. A timed element (caption, ring) holds only
  `<span>`s, or lint asks for another sub-composition.
- **Same source, many windows**: each step is its own `<video>` with
  `data-media-start`; holds are PNG stills extracted by ffmpeg.
- **Every `<audio>` needs an `id` and a real `data-duration`.** Without the
  duration, lint treats each SFX as playing to the end and flags hundreds of
  overlaps (`duplicate_audio_track`).
- **Fonts need a local `@font-face`** in every file that uses them (each scene
  repeats it, with the shared styles); system fonts may not exist at render time.
- **Footage should be all-intra** (`import.mjs` encodes with `-g 1`) so the preview
  can seek between many short windows without stutter. Renders are frame-exact
  either way.
- Validate with `npx hyperframes check` (lint + runtime + layout + contrast).
  Snapshots: `npx hyperframes snapshot --at t1,t2 --no-end` → `snapshots/`.
- Renders: `--quality draft` for review, `--quality delivery` for the final file.
- `check` should come back clean. The zoom wrapper carries
  `data-layout-allow-overflow` because the stage clips the scaled footage on
  purpose; Hyperframes has no other way to silence a rule, so fix the structure.

For anything beyond this, load the `hyperframes-core` skill.
