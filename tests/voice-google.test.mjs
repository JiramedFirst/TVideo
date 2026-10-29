// Offline test of voice.mjs --engine google: a local fake of the Text-to-Speech
// REST API serves a real (ffmpeg-made) MP3, so no key or network is needed.
// Covers voices.json + durations, the API-key header, the request body, the
// --list output, and that a second run re-bills nothing.
//
//   node tests/voice-google.test.mjs
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const VOICE_JS = resolve(import.meta.dirname, '../plugin/skills/tvideo/scripts/voice.mjs');
let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failed++;
};

const work = mkdtempSync(join(tmpdir(), 'tvideo-gvoice-'));
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=1.5', '-c:a', 'libmp3lame', join(work, 'tone.mp3')]);
const MP3 = readFileSync(join(work, 'tone.mp3')).toString('base64');

const calls = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls.push({ url: req.url, key: req.headers['x-goog-api-key'], body: body && JSON.parse(body) });
    if (req.url.startsWith('/voices')) {
      res.end(JSON.stringify({ voices: [{ name: 'th-TH-Chirp3-HD-Test', ssmlGender: 'FEMALE', languageCodes: ['th-TH'] }] }));
    } else res.end(JSON.stringify({ audioContent: MP3 }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const env = { ...process.env, GOOGLE_TTS_API_KEY: 'k123', TV_GOOGLE_TTS_URL: `http://127.0.0.1:${server.address().port}` };
// Async exec: the fake server runs in this process, so a sync spawn would block it.
const run = (args, e = env) => new Promise((ok, ko) =>
  execFile('node', [VOICE_JS, ...args], { cwd: work, env: e }, (err, out) => (err ? ko(err) : ok(out))));

try {
  writeFileSync(join(work, 'plan.json'), JSON.stringify({
    intro: { narration: 'สวัสดีครับ' },
    steps: [{ id: 's01', narration: 'กด Save' }, { id: 's02' }],
    outro: { narration: 'จบแล้วครับ' },
  }));

  const listed = await run(['--engine', 'google', '--list', '--lang', 'th-TH']);
  check(listed.includes('th-TH-Chirp3-HD-Test'), '--list prints the voice name');
  check(calls[0].url === '/voices?languageCode=th-TH', '--list filters by language');

  // Preview: one plan line, cached, voices.json untouched (a partial one would strip the other steps' voices).
  calls.length = 0;
  const one = await run(['--engine', 'google', '--voice', 'th-TH-Chirp3-HD-Test', '--only', 's01']);
  check(calls.length === 1 && calls[0].body.input.text === 'กด Save', '--only s01 synthesizes just that line');
  check(one.includes('assets/voice/s01.mp3') && !existsSync(join(work, 'voices.json')), '--only prints the file and leaves voices.json alone');
  const bad = await run(['--engine', 'google', '--voice', 'th-TH-Chirp3-HD-Test', '--only', 's02']).then(() => '', String);
  check(bad.includes('no narration line "s02"') && bad.includes('intro, s01, outro'), '--only with an unknown or unnarrated id lists the ids');

  calls.length = 0;
  const sample = await run(['--engine', 'google', '--voice', 'th-TH-Chirp3-HD-Test', '--sample', 'เปิด Dashboard']);
  check(calls.length === 1 && calls[0].body.input.text === 'เปิด Dashboard' && sample.includes('assets/voice/_sample-th-TH-Chirp3-HD-Test.mp3'), '--sample synthesizes the given text and prints a per-voice file');
  check(!existsSync(join(work, 'voices.json')), '--sample leaves voices.json alone');
  const both = await run(['--engine', 'google', '--voice', 'th-TH-A', '--only', 's01', '--sample', 'x']).then(() => '', String);
  check(both.includes('not both'), '--only with --sample is refused');
  calls.length = 0;
  const noValue = await run(['--engine', 'google', '--voice', 'th-TH-A', '--only']).then(() => '', String);
  const empty = await run(['--engine', 'google', '--voice', 'th-TH-A', '--sample', '']).then(() => '', String);
  check(noValue.includes('--only needs a value') && empty.includes('--sample needs a value') && calls.length === 0, 'a preview flag without a value is refused, nothing billed');

  calls.length = 0;
  await run(['--engine', 'google', '--voice', 'th-TH-Chirp3-HD-Test']);
  const voices = JSON.parse(readFileSync(join(work, 'voices.json'), 'utf8'));
  check(Object.keys(voices).join() === 'intro,s01,outro', 'one entry per narrated line, unnarrated step skipped');
  check(Math.abs(voices.s01.duration - 1.5) < 0.1, `duration read from the mp3 (${voices.s01.duration})`);
  check(calls.length === 2 && calls.every((c) => c.key === 'k123'), 'full run after a preview bills only the other two lines, API key in header');
  const b = calls.find((c) => c.body.input.text === 'สวัสดีครับ')?.body;
  check(b?.voice.languageCode === 'th-TH' && b.voice.name === 'th-TH-Chirp3-HD-Test', 'language derived from voice name');

  calls.length = 0;
  await run(['--engine', 'google', '--voice', 'th-TH-Chirp3-HD-Test']);
  check(calls.length === 0, 'second run with unchanged lines calls the API zero times');

  // --only on a voiced clip: that entry must follow its new mp3, the rest stay.
  const vPath = join(work, 'voices.json');
  writeFileSync(vPath, JSON.stringify({ ...voices, s01: { ...voices.s01, duration: 9 } }));
  const plan = JSON.parse(readFileSync(join(work, 'plan.json'), 'utf8'));
  plan.steps[0].narration = 'กด Save อีกครั้ง';
  writeFileSync(join(work, 'plan.json'), JSON.stringify(plan));
  calls.length = 0;
  await run(['--engine', 'google', '--voice', 'th-TH-Chirp3-HD-Test', '--only', 's01']);
  const after = JSON.parse(readFileSync(vPath, 'utf8'));
  check(calls.length === 1 && Math.abs(after.s01.duration - 1.5) < 0.1 && Object.keys(after).join() === 'intro,s01,outro', '--only refreshes its own voices.json entry and keeps the others');

  const noKey = await run(['--engine', 'google', '--voice', 'th-TH-A'], { ...env, GOOGLE_TTS_API_KEY: '' }).then(() => '', String);
  check(noKey.includes('GOOGLE_TTS_API_KEY is not set'), 'missing key fails with a clear message');
} finally {
  server.close();
}
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all ok');
