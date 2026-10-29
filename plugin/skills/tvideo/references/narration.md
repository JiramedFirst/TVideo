# Narration (optional)

Captions + click sounds already make a complete tutorial; narration is an upgrade
that costs TTS quota and review time. Offer it, don't assume it.

## Writing the lines

Put `narration` on `plan.intro`, each step, and `plan.outro` in plan.json. One or
two plain sentences per step, describing *why/what to look for*, not repeating the
caption word for word. Polite particles and tone follow the voice (e.g. Thai male
voice → "ครับ").

**Mixed-language terms.** Multilingual voices pronounce English terms best in
Latin script ("Dashboard", "PO", "PDF"). Brand names with a local
pronunciation are the exception — write them as locals say them (e.g. a Thai
brand read in Thai script). Generate one test line and listen before generating
all of them — add `--sample "<text>"` or `--only <id>` (e.g. `--only intro`) to the
`voice.mjs` command below, keeping its `--engine`/`--voice`/`--lang`. Each writes one
MP3 and prints its path.
- `--sample` writes `assets/voice/_sample-<voice>.mp3`: use it to compare voices and
  to test a term before it is in plan.json.
- `--only` makes the real line of the chosen voice and caches it, so the full run
  doesn't bill it again. On a voiced clip it refreshes that line's `voices.json` entry,
  and refuses (before billing) when the clip was voiced with another voice/language or
  the entry points at a hand-made file.
Have the user play the file: speech recognition can't judge pronunciation in every
language (the default Whisper `small.en` is no help for Thai).

## Generating (HeyGen via Hyperframes media-use)

1. Sign in: `npx hyperframes auth login` (in a real terminal; device/browser flow).
   Check with `npx hyperframes auth status`.
2. Pick a voice. `heygen-tts.mjs --list` shows only the first page (50 voices,
   mostly English). Native voices for other languages are further down — page
   through the catalog (`/voices?engine=starfish&type=public&limit=100&token=<next_token>`)
   and filter by `language`, or try a "Multilingual" voice. Play 2–3 samples to the
   user and let them choose.
3. `node <skill>/scripts/voice.mjs --voice <id> --lang <code>` in the clip project.
   It writes `assets/voice/*.mp3` + `voices.json` and only regenerates changed
   lines. Then `node build.mjs` — steps stretch to fit the voice.

## Generating (Google Cloud Text-to-Speech)

An alternative with many native voices (Thai included) and a larger free tier.

1. In Google Cloud Console enable **Cloud Text-to-Speech API** and create an API
   key (APIs & Services → Credentials). The key never goes into chat, and you never
   write it yourself: have the user put it in a file only they can read —
   `~/.config/tvideo/google-tts.env`, containing `GOOGLE_TTS_API_KEY=…`, mode 600
   (`mkdir -p ~/.config/tvideo && touch ~/.config/tvideo/google-tts.env && chmod 600 ~/.config/tvideo/google-tts.env`,
   then they paste the line in with an editor). `voice.mjs` reads that file when
   the key isn't already in the environment (another path: `TV_ENV_FILE=<file>`),
   and warns if others can read it. An `export GOOGLE_TTS_API_KEY=…` in the user's
   own shell still works, but agent harnesses rarely carry it between commands;
   `node --env-file=<file> <skill>/scripts/voice.mjs …` works for one command on
   any Node.
2. List voices: `node <skill>/scripts/voice.mjs --engine google --list --lang th-TH`
   (catalog: https://cloud.google.com/text-to-speech/docs/list-voices-and-types).
   `Chirp3-HD` voices sound most natural; run `--sample "<a real line>"` with 2–3 voices and let the user choose.
3. `node <skill>/scripts/voice.mjs --engine google --voice <name>` in the clip
   project (language is taken from the voice name). Same `voices.json`, same
   skip-unchanged behaviour, then `node build.mjs`.

## Quota

Free plans allow only a couple of minutes of TTS per month. Budget ≈ (number of
clips × 70–90 s). If the quota runs out mid-project, stop and tell the user —
options: upgrade the plan, wait for the reset, use captions only, or record a
human voice per line (drop files into `assets/voice/` and write `voices.json`
with each line's `path` and `duration`).

## Keep the files

Never delete `assets/voice/` to "switch to captions only" — set aside
`voices.json` instead (rename it). Regenerating later costs quota again.
