// voice.mjs — OPTIONAL narration. Run inside an editor project:
//
//   node <skill>/scripts/voice.mjs --voice <heygenVoiceId> --lang th
//   node <skill>/scripts/voice.mjs --engine google --voice th-TH-Chirp3-HD-Achernar
//   node <skill>/scripts/voice.mjs --engine google --list --lang th-TH
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

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
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

const plan = JSON.parse(readFileSync('plan.json', 'utf8'));
const lines = [
  plan.intro && { id: 'intro', text: plan.intro.narration },
  ...plan.steps.map((s) => ({ id: s.id, text: s.narration })),
  plan.outro && { id: 'outro', text: plan.outro.narration },
].filter((l) => l && l.text);
mkdirSync('assets/voice', { recursive: true });

const out = {};
for (const { id, text } of lines) {
  const path = `assets/voice/${id}.mp3`;
  const hashFile = `${path}.sha`;
  // HeyGen keeps its original hash input so existing projects don't re-bill
  // every line after this upgrade; Google is prefixed so switching engines
  // with the same voice string still regenerates.
  const hash = createHash('sha1').update(`${ENGINE === 'google' ? 'google|' : ''}${VOICE}|${LANG}|${text}`).digest('hex');
  if (!existsSync(path) || !existsSync(hashFile) || readFileSync(hashFile, 'utf8') !== hash) {
    await synth(text, path);
    writeFileSync(hashFile, hash);
  }
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim());
  out[id] = { path, duration };
}
writeFileSync('voices.json', JSON.stringify(out, null, 2));
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.duration.toFixed(1)}s`).join(' '));
