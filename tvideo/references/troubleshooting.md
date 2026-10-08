# Troubleshooting — failures already seen, and their real cause

| Symptom | Real cause | Fix |
|---|---|---|
| Zoom/ring lands on a different page than the button | The click happens at the very start of the step, so by the time the zoom finishes the page has changed | `holdFirst: true` on that step |
| A hold still shows the next step's screen (dialog already open) | Next step's click landed exactly on the boundary | Build samples `end − 0.2 s`; if still wrong, add a `hold()` at the end of the previous step in the spec and re-record |
| Clip videos from an earlier run disappeared | Playwright wipes `outputDir` at run start; two configs sharing one `outputDir` wipe each other | Import/copy right after each take; give each config its own `outputDir` |
| "Day N is disabled" in the date picker | Real booking window vs hardcoded date | `relativeDay()` |
| Validation error on submit that tests never hit | Real environment config (breaks, capacity, cut-off, required fields) | Read the error on the failure screenshot; choose valid values dynamically |
| Preview stutters / audio choppy | Studio seeks across many windows of one long-GOP file | `import.sh` makes footage all-intra; judge timing from a draft render |
| `duplicate_audio_track` × hundreds | `<audio>` without `data-duration` | Template sets it; keep it if you add sounds |
| `check` reports contrast < 3:1 on a caption badge at one timestamp | Sampled during the caption's 0.4 s fade-in | Expected; confirm a mid-step snapshot is readable |
| `stdout` JSON truncated at 64 KB in a node script | `process.exit()` before the pipe drained | `process.stdout.write(data, () => process.exit(0))` |
| TTS "free voice-generation time left" error | Quota exhausted | See narration.md → Quota; keep existing voice files |
| A narrated word is mispronounced | Script form of the term | Latin script for English terms; local spelling for local brand names; regenerate only that line |
| Dev-server badge ("N") in the corner of every frame | Next.js dev tools overlay | `createTimeline` hides it; re-record |
| Login works locally but `auth.setup` times out on staging | Different form selectors / SSO / 2FA | Set `TV_*_SELECTOR`, or log in inside the clip with an OTP pause |
