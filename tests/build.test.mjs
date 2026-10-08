// Fast test of the editor alone: synthetic footage + fixture timeline/clicks,
// no browser, no network (~2 s). Covers the decisions build.mjs makes from the
// recorder's data — auto-ring, auto-holdFirst, still sampling and its cache,
// voice pacing, caption shrink, subtitles — and the inputs it must refuse.
//
//   node tests/build.test.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EDITOR = resolve(import.meta.dirname, '../plugin/skills/tvideo/templates/editor');
let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failed++;
};

// One 10 s 1280x800 clip shared by every case (all-intra, like import.mjs makes).
const footage = join(mkdtempSync(join(tmpdir(), 'tvideo-footage-')), 'footage.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x800:rate=25:duration=10', '-g', '1', '-pix_fmt', 'yuv420p', footage]);

const TIMELINE = [
  { label: 'one', startMs: 500, endMs: 3000 },
  { label: 'two', startMs: 3000, endMs: 6000 },
  { label: 'three', startMs: 6000, endMs: 9500 },
];
const CLICKS = [
  { ms: 3800, box: { x: 600, y: 100, w: 120, h: 40 }, gone: true },
  { ms: 6500, box: { x: 300, y: 400, w: 200, h: 50 } },
];
const PLAN = {
  title: 'T', footage: 'assets/footage.mp4', outro: { title: 'Done', line: '' },
  steps: [
    { id: 's01', caption: 'Open the page' },
    { id: 's02', caption: 'Click New', zoom: true },
    { id: 's03', caption: 'A long caption that goes on and on so that it has to wrap onto a second line in the band below the footage, and then some more', zoom: { ring: true, scale: 1.4 } },
  ],
};

/** A fresh editor project with the given fixtures; returns {dir, build()}. */
function project({ plan = PLAN, timeline = TIMELINE, clicks = CLICKS, voices } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tvideo-build-'));
  cpSync(EDITOR, dir, { recursive: true });
  cpSync(footage, join(dir, 'assets/footage.mp4'));
  const cfg = JSON.parse(readFileSync(join(dir, 'tvideo.config.example.json'), 'utf8'));
  writeFileSync(join(dir, 'tvideo.config.json'), JSON.stringify({ ...cfg, music: null, sfx: false, logo: null }));
  const put = (f, v) => writeFileSync(join(dir, f), JSON.stringify(v));
  put('plan.json', plan);
  put('timeline.json', timeline);
  put('clicks.json', clicks);
  if (voices) put('voices.json', voices);
  return {
    dir,
    put,
    build() {
      try {
        execFileSync('node', ['build.mjs'], { cwd: dir, stdio: 'pipe' });
        return { html: readFileSync(join(dir, 'index.html'), 'utf8') };
      } catch (e) {
        return { error: e.stderr.toString() };
      }
    },
  };
}
const attr = (html, id, name) => new RegExp(`id="${id}"[^>]*?${name}="([^"]*)"`).exec(html)?.[1];
const stepStart = (html, id) => Number(attr(html, `cap-${id}`, 'data-start'));
const K = 1.125; // 1280x800 fitted into the 1440x900 stage

{
  const p = project({ voices: { s03: { path: 'assets/v.mp3', duration: 6 } } });
  const { html, error } = p.build();
  check(!error, `builds${error ? `: ${error}` : ''}`);
  // auto-ring: s02's ring = its click box, padded 6 px, scaled to the stage
  check(attr(html, 'ring-s02', 'style')?.startsWith(`left:${(600 - 60 - 6) * K}px;top:${(100 - 20 - 6) * K}px`), 'ring: true rings the click box');
  check(Boolean(attr(html, 'ring-s03', 'style')), 'zoom: {ring: true} rings too');
  // auto-holdFirst: s02's control was gone after the click → still first, sampled
  // just before the click; the action starts there too (no jump back).
  check(Number(attr(html, 'h-s02', 'data-start')) === stepStart(html, 's02'), 'gone click → holdFirst (still first)');
  check(attr(html, 'h-s02', 'src') === 'assets/holds/s02-3.65.png', 'holdFirst still = click − 0.15 s');
  check(attr(html, 'v-s02', 'data-media-start') === '3.65', 'holdFirst action starts at the same moment');
  // s03's control stayed → default: action, then the settled end state.
  check(attr(html, 'h-s03', 'src') === 'assets/holds/s03-9.30.png', 'default still = step end − 0.2 s');
  const s03dur = Number(attr(html, 'cap-s03', 'data-duration'));
  check(s03dur >= 6 + 0.65 - 0.001, `voice paces the step (${s03dur}s ≥ 6.65s)`);
  check(/class="cap-text" style="font-size:(\d+)px">A long/.exec(html)?.[1] < 40, 'long caption shrinks to fit the band');
  check(/class="cap-text" style="font-size:40px">Open/.test(html), 'short caption keeps 40 px');
  check(html.includes('src="assets/vendor/gsap.min.js"') && existsSync(join(p.dir, 'assets/vendor/gsap.min.js')), 'GSAP is local (offline render)');
  const srt = readFileSync(join(p.dir, 'captions.srt'), 'utf8');
  check((srt.match(/-->/g) ?? []).length === 3 && srt.startsWith('1\n00:00:0'), 'captions.srt has one cue per step');
  check(readFileSync(join(p.dir, 'captions.vtt'), 'utf8').startsWith('WEBVTT'), 'captions.vtt written');

  // Flipping holdFirst moves the sample point → a new still, not the cached one.
  p.put('plan.json', { ...PLAN, steps: PLAN.steps.map((s) => (s.id === 's02' ? { ...s, holdFirst: false } : s)) });
  const again = p.build();
  check(attr(again.html, 'h-s02', 'src') === 'assets/holds/s02-5.80.png' && existsSync(join(p.dir, 'assets/holds/s02-5.80.png')), 'still cache is keyed on time');
}
{
  // v1 recorder: clicks.json is bare ms. Explicit rings still build; auto-ring
  // explains itself instead of guessing.
  const legacy = [3800, 6500];
  const ok = project({ clicks: legacy, plan: { ...PLAN, steps: [PLAN.steps[0], { id: 's02', caption: 'x', holdFirst: true, zoom: { ring: { x: 600, y: 100, w: 120, h: 40 } } }, { id: 's03', caption: 'y' }] } }).build();
  check(!ok.error && ok.html.includes('id="ring-s02"'), 'v1 clicks.json + explicit ring builds');
  check(/has no box/.test(project({ clicks: legacy }).build().error ?? ''), 'v1 clicks.json + ring: true is refused with a reason');
}
check(/must match 1:1/.test(project({ timeline: TIMELINE.slice(0, 2) }).build().error ?? ''), 'plan/timeline step-count mismatch is refused');
check(/past the end of the footage/.test(project({ timeline: [...TIMELINE.slice(0, 2), { label: 'x', startMs: 12000, endMs: 14000 }] }).build().error ?? ''), 'a step past the end of the footage is refused');
check(/only 0 tap/.test(project({ clicks: [] }).build().error ?? ''), 'ring: true on a step without taps is refused');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nbuild tests passed');
