// voice.mjs — OPTIONAL narration. Run inside an editor project:
//
//   node <skill>/scripts/voice.mjs --voice <heygenVoiceId> --lang th
//   node <skill>/scripts/voice.mjs --engine google --voice th-TH-Chirp3-HD-Achernar
//   node <skill>/scripts/voice.mjs --engine google --list --lang th-TH
//   node <skill>/scripts/voice.mjs --voice <id> --lang th --only intro       # preview one plan line
//   node <skill>/scripts/voice.mjs --voice <id> --lang th --sample "<text>"  # preview any text
// (a preview takes the same --engine/--voice/--lang as the full run, or the full run re-bills it)
//
// Reads `narration` on plan.json's intro, steps[] and outro, generates one file
// per line with HeyGen TTS (via the Hyperframes media-use skill) or Google Cloud
// Text-to-Speech (`--engine google`, key in GOOGLE_TTS_API_KEY) and writes
// voices.json {id: {path, duration}} that build.mjs uses to pace each step.
// A line is regenerated only when its text or voice changed (hash next to the
// file) — TTS quota is small on free plans, so never re-bill unchanged lines.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Strict flags: a typo, `--x=v` or a missing value would otherwise fall through to a
// full run that bills every line, which is what the preview flags exist to avoid.
const VALUE_FLAGS = ['engine', 'voice', 'lang', 'only', 'sample'];
const flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = /^--([^=]+)(?:=(.*))?$/s.exec(process.argv[i]);
  if (!m) throw new Error(`unexpected argument "${process.argv[i]}" — quote text with spaces: --sample "<text>".`);
  const [, name, inline] = m;
  if (name === 'list') { flags.list = true; continue; }
  if (!VALUE_FLAGS.includes(name)) throw new Error(`unknown flag --${name} (known: --${VALUE_FLAGS.join(', --')}, --list).`);
  const v = inline ?? process.argv[++i];
  if (!v || (inline === undefined && v.startsWith('--'))) throw new Error(`--${name} needs a value.`);
  flags[name] = v;
}
const arg = (name, def) => flags[name] ?? def;
const ENGINE = arg('engine', 'heygen');
const VOICE = arg('voice');

// Google: plain REST + an API key, so no gcloud/SDK install is needed. The key
// goes in a header, not the URL, so it never lands in a proxy/access log.
// TV_GOOGLE_TTS_URL exists only so tests can point this at a local fake.
const GOOGLE = process.env.TV_GOOGLE_TTS_URL ?? 'https://texttospeech.googleapis.com/v1';
const google = async (path, body) => {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new Error('GOOGLE_TTS_API_KEY is not set (Cloud Console → APIs & Services → Credentials; enable "Cloud Text-to-Speech API").');
  const res = await fetch(`${GOOGLE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google TTS ${res.status}: ${await res.text()}`);
  return res.json();
};

if (ENGINE === 'google' && process.argv.includes('--list')) {
  const lang = arg('lang', '');
  const { voices = [] } = await google(`/voices${lang ? `?languageCode=${encodeURIComponent(lang)}` : ''}`);
  for (const v of voices) console.log(`${v.name}\t${v.ssmlGender}\t${v.languageCodes.join(',')}`);
  process.exit(0);
}
if (!VOICE) throw new Error('--voice <id> is required (list voices: see references/narration.md).');
if (!['heygen', 'google'].includes(ENGINE)) throw new Error(`--engine must be heygen or google, got "${ENGINE}".`);

// A Google voice name starts with its language code (th-TH-Chirp3-HD-…), so
// --lang is optional there; HeyGen keeps its old default of 'en'.
const LANG = arg('lang', ENGINE === 'google' ? VOICE.split('-').slice(0, 2).join('-') : 'en');

let synth;
if (ENGINE === 'google') {
  synth = async (text, path) => {
    const { audioContent } = await google('/text:synthesize', {
      input: { text },
      voice: { languageCode: LANG, name: VOICE },
      audioConfig: { audioEncoding: 'MP3' },
    });
    writeFileSync(path, Buffer.from(audioContent, 'base64'));
  };
} else {
  const tried = [process.env.TV_MEDIA_USE_DIR, join(homedir(), '.claude/skills/media-use'), join(homedir(), '.agents/skills/media-use')]
    .filter(Boolean)
    .map((d) => join(d, 'audio/scripts/heygen-tts.mjs'));
  const TTS = tried.find(existsSync);
  if (!TTS) throw new Error(`heygen-tts.mjs not found. Tried:\n  ${tried.join('\n  ')}\nRun: npx hyperframes skills update media-use, or set TV_MEDIA_USE_DIR.`);
  synth = (text, path) => {
    const args = [TTS, text, '--voice', VOICE, '-o', path];
    if (LANG !== 'en') args.push('--lang', LANG);
    execFileSync('node', args, { stdio: 'inherit' });
  };
}

const duration = (path) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim());
const ONLY = arg('only');
const SAMPLE = arg('sample');
if (ONLY && SAMPLE) throw new Error('use --only <id> or --sample "<text>", not both.');

if (SAMPLE) {
  // One file per voice and language, so candidates can be compared side by side.
  mkdirSync('assets/voice', { recursive: true });
  const path = `assets/voice/_sample-${`${VOICE}-${LANG}`.replace(/[^\w.-]/g, '_')}.mp3`;
  await synth(SAMPLE, path);
  console.log(`${path} ${duration(path).toFixed(1)}s — listen before generating every line`);
  process.exit(0);
}

const plan = JSON.parse(readFileSync('plan.json', 'utf8'));
mkdirSync('assets/voice', { recursive: true });
const all = [
  plan.intro && { id: 'intro', text: plan.intro.narration },
  ...plan.steps.map((s) => ({ id: String(s.id), text: s.narration })),
  plan.outro && { id: 'outro', text: plan.outro.narration },
].filter((l) => l && l.text);
const lines = ONLY ? all.filter((l) => l.id === ONLY) : all;
if (ONLY && !lines.length) throw new Error(`no narration line "${ONLY}" in plan.json — narrated ids: ${all.map((l) => l.id).join(', ')}.`);

// HeyGen keeps its original hash input so existing projects don't re-bill
// every line after this upgrade; Google is prefixed so switching engines
// with the same voice string still regenerates.
const hashOf = (text) => createHash('sha1').update(`${ENGINE === 'google' ? 'google|' : ''}${VOICE}|${LANG}|${text}`).digest('hex');
const cached = (id, text) => {
  const sha = `assets/voice/${id}.mp3.sha`;
  return existsSync(sha) && readFileSync(sha, 'utf8') === hashOf(text);
};

// --only on a voiced clip replaces a line the build uses, so check before billing anything.
const voiced = ONLY && existsSync('voices.json') ? JSON.parse(readFileSync('voices.json', 'utf8')) : null;
if (voiced) {
  const own = `assets/voice/${ONLY}.mp3`;
  if (voiced[ONLY] && voiced[ONLY].path !== own) {
    throw new Error(`voices.json points "${ONLY}" at ${voiced[ONLY].path} (not made by voice.mjs) — not replacing it. Use --sample to try a line.`);
  }
  // Every other voiced line misses the cache under these settings → another voice/language made this clip.
  const others = all.filter((l) => l.id !== ONLY && voiced[l.id]?.path === `assets/voice/${l.id}.mp3` && existsSync(`assets/voice/${l.id}.mp3.sha`));
  if (others.length && !others.some((l) => cached(l.id, l.text))) {
    throw new Error(`this clip was voiced with another --engine/--voice/--lang; --only "${ONLY}" would mix two voices. Use --sample to try this voice, or run without --only to re-voice every line.`);
  }
}

const out = {};
for (const { id, text } of lines) {
  const path = `assets/voice/${id}.mp3`;
  const hashFile = `${path}.sha`;
  const hash = hashOf(text);
  if (!existsSync(path) || !cached(id, text)) {
    await synth(text, path);
    writeFileSync(hashFile, hash);
  }
  out[id] = { path, duration: duration(path) };
}
if (ONLY) {
  // Same hash cache as a full run, so approving this line costs nothing later.
  // An existing voices.json gets this one entry refreshed (the mp3 it points at just changed);
  // none is created, since a partial one would leave the other steps unvoiced in the build.
  const kept = !!voiced;
  if (kept) writeFileSync('voices.json', JSON.stringify({ ...voiced, ...out }, null, 2));
  console.log(`${out[ONLY].path} ${out[ONLY].duration.toFixed(1)}s — ${kept ? `voices.json entry "${ONLY}" updated` : 'no voices.json written; run without --only when the voice is approved'}`);
  process.exit(0);
}
writeFileSync('voices.json', JSON.stringify(out, null, 2));
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.duration.toFixed(1)}s`).join(' '));
