// Fast test of the editor alone: synthetic footage + fixture timeline/clicks,
// no browser, no network (~2 s). Covers the decisions build.mjs makes from the
// recorder's data — auto-ring, auto-holdFirst, still sampling and its cache,
// voice pacing, caption shrink, subtitles — and the inputs it must refuse.
//
//   node tests/build.test.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
function project({ plan = PLAN, timeline = TIMELINE, clicks = CLICKS, voices, config = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tvideo-build-'));
  cpSync(EDITOR, dir, { recursive: true });
  cpSync(footage, join(dir, 'assets/footage.mp4'));
  const cfg = JSON.parse(readFileSync(join(dir, 'tvideo.config.example.json'), 'utf8'));
  writeFileSync(join(dir, 'tvideo.config.json'), JSON.stringify({ ...cfg, music: null, sfx: false, logo: null, ...config }));
  const put = (f, v) => writeFileSync(join(dir, f), JSON.stringify(v));
  put('plan.json', plan);
  put('timeline.json', timeline);
  put('clicks.json', clicks);
  if (voices) put('voices.json', voices);
  return {
    dir,
    put,
    build(env) {
      const r = spawnSync('node', ['build.mjs'], { cwd: dir, encoding: 'utf8', env: env && { ...process.env, ...env } });
      if (r.status !== 0) return { error: r.stderr };
      // index.html hosts one sub-composition per scene: compositions/<id>.html.
      const scene = (id) => {
        const f = join(dir, 'compositions', `${id}.html`);
        return existsSync(f) ? readFileSync(f, 'utf8') : '';
      };
      return { html: readFileSync(join(dir, 'index.html'), 'utf8'), scene, warnings: r.stderr };
    },
  };
}
const attr = (html, id, name) => new RegExp(`id="${id}"[^>]*?${name}="([^"]*)"`).exec(html)?.[1];
const K = 1.125; // 1280x800 fitted into the 1440x900 stage
const ms = (v) => Math.round(Number(v) * 1000);
// Scene hosts in index.html, in order, timed as written (whole ms).
const hosts = (html) => [...html.matchAll(/<div id="([^"]+)" data-composition-id="[^"]+" data-composition-src="[^"]+" data-start="([^"]+)" data-duration="([^"]+)"/g)]
  .map(([, id, s, d]) => ({ id, start: ms(s), dur: ms(d) }));
// The zoom-in and zoom-out of one step must not overlap and must end inside the scene.
const zoomOk = (scene, id) => {
  const [zin, zout] = [...scene.matchAll(new RegExp(`fromTo\\('#zoom-${id}'.*?duration: ([\\d.]+).*?\\}, ([\\d.]+)\\);`, 'g'))].map(([, d, at]) => ({ d: ms(d), at: ms(at) }));
  return Boolean(zin && zout) && zout.at >= zin.at + zin.d && zout.at + zout.d <= ms(attr(scene, `cap-${id}`, 'data-duration'));
};

{
  const p = project({ voices: { s03: { path: 'assets/v.mp3', duration: 6 } } });
  const { html, scene, error } = p.build();
  check(!error, `builds${error ? `: ${error}` : ''}`);
  const [s01, s02, s03] = ['s01', 's02', 's03'].map((id) => scene(`step-${id}`));
  const ids = ['intro', 'step-s01', 'step-s02', 'step-s03', 'outro'];
  check(ids.every((id) => scene(id).includes(`<div id="${id}" data-composition-id="${id}"`)), 'one scene file per step, plus intro and outro');
  check(ids.every((id) => html.includes(`<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html"`)), 'index.html hosts every scene');
  check(!/fromTo\('#intro-(title|sub)'/.test(scene('intro')) && scene('intro').includes('id="intro-title"'), 'intro title is on screen from frame 0 (no fade-in)');
  check(/\.credit \{[^}]*font-size: 28px/.test(scene('outro')), 'music credit is 28 px (type floor)');
  const hs = hosts(html);
  const rootEnd = ms(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/.exec(html)?.[1]);
  check(hs.map((h) => h.id).join() === ids.join() && hs[0].start === 0 && hs.every((h, i) => h.start + h.dur === (hs[i + 1]?.start ?? rootEnd)),
    'scene hosts meet exactly: intro → steps → outro → root end');
  // Non-zero scene-local offsets, and the last clip of a step ends on the scene's end.
  const end = (sc, id) => ms(attr(sc, id, 'data-start')) + ms(attr(sc, id, 'data-duration'));
  check(ms(attr(s02, 'v-s02', 'data-start')) > 0 && attr(s02, 'v-s02', 'data-start') === attr(s02, 'h-s02', 'data-duration'), 'holdFirst: the action starts where the still ends (local time)');
  check(ms(attr(s03, 'h-s03', 'data-start')) > 0 && attr(s03, 'h-s03', 'data-start') === attr(s03, 'v-s03', 'data-duration'), 'default: the still starts where the action ends (local time)');
  check(attr(s03, 'ring-s03', 'data-start') === attr(s03, 'h-s03', 'data-start'), 'ring starts with the still (local time)');
  check(end(s02, 'v-s02') === ms(attr(s02, 'cap-s02', 'data-duration')) && end(s03, 'h-s03') === ms(attr(s03, 'cap-s03', 'data-duration'))
    && attr(s03, 'cap-s03', 'data-duration') === attr(html, 'step-s03', 'data-duration'), 'footage and caption reach the scene end exactly');
  check(zoomOk(s02, 's02') && zoomOk(s03, 's03'), 'zoom-out follows the zoom-in and ends inside the step');
  // auto-ring: s02's ring = its click box, padded 6 px, scaled to the stage
  check(attr(s02, 'ring-s02', 'style')?.startsWith(`left:${(600 - 60 - 6) * K}px;top:${(100 - 20 - 6) * K}px`), 'ring: true rings the click box');
  check(Boolean(attr(s03, 'ring-s03', 'style')), 'zoom: {ring: true} rings too');
  // auto-holdFirst: s02's control was gone after the click → still first, sampled
  // just before the click; the action starts there too (no jump back).
  // Scene-local times: 0 is the step's first frame.
  check(attr(s02, 'h-s02', 'data-start') === '0' && attr(s02, 'cap-s02', 'data-start') === '0', 'gone click → holdFirst (still first)');
  check(attr(s02, 'h-s02', 'src') === 'assets/holds/s02-3.65.png', 'holdFirst still = click − 0.15 s');
  check(attr(s02, 'v-s02', 'data-media-start') === '3.65', 'holdFirst action starts at the same moment');
  // s03's control stayed → default: action, then the settled end state.
  check(attr(s03, 'h-s03', 'src') === 'assets/holds/s03-9.30.png', 'default still = step end − 0.2 s');
  const s03dur = Number(attr(s03, 'cap-s03', 'data-duration'));
  check(s03dur >= 6 + 0.65 - 0.001 && attr(html, 'step-s03', 'data-duration') === String(s03dur), `voice paces the step (${s03dur}s ≥ 6.65s)`);
  check(/class="cap-text" style="font-size:(\d+)px">A long/.exec(s03)?.[1] < 40, 'long caption shrinks to fit the band');
  check(/class="cap-text" style="font-size:40px">Open/.test(s01), 'short caption keeps 40 px');
  check(html.includes('src="assets/vendor/gsap.min.js"') && existsSync(join(p.dir, 'assets/vendor/gsap.min.js')), 'GSAP is local (offline render)');
  const srt = readFileSync(join(p.dir, 'captions.srt'), 'utf8');
  check((srt.match(/-->/g) ?? []).length === 3 && srt.startsWith('1\n00:00:0'), 'captions.srt has one cue per step');
  check(readFileSync(join(p.dir, 'captions.vtt'), 'utf8').startsWith('WEBVTT'), 'captions.vtt written');

  // Flipping holdFirst moves the sample point → a new still, not the cached one.
  p.put('plan.json', { ...PLAN, steps: PLAN.steps.map((s) => (s.id === 's02' ? { ...s, holdFirst: false } : s)) });
  const again = p.build();
  check(attr(again.scene('step-s02'), 'h-s02', 'src') === 'assets/holds/s02-5.80.png' && existsSync(join(p.dir, 'assets/holds/s02-5.80.png')), 'still cache is keyed on time');

  // A re-record with fewer steps leaves no stale scene behind.
  p.put('plan.json', { ...PLAN, steps: PLAN.steps.slice(0, 2) });
  p.put('timeline.json', TIMELINE.slice(0, 2));
  const fewer = p.build();
  check(!fewer.error && fewer.scene('step-s02') && !existsSync(join(p.dir, 'compositions/step-s03.html')), 'rebuild drops scene files of removed steps');
}
{
  // v1 recorder: clicks.json is bare ms. Explicit rings still build; auto-ring
  // explains itself instead of guessing.
  const legacy = [3800, 6500];
  const ok = project({ clicks: legacy, plan: { ...PLAN, steps: [PLAN.steps[0], { id: 's02', caption: 'x', holdFirst: true, zoom: { ring: { x: 600, y: 100, w: 120, h: 40 } } }, { id: 's03', caption: 'y' }] } }).build();
  check(!ok.error && ok.scene('step-s02').includes('id="ring-s02"'), 'v1 clicks.json + explicit ring builds');
  check(/has no box/.test(project({ clicks: legacy }).build().error ?? ''), 'v1 clicks.json + ring: true is refused with a reason');
}
{
  // Steps shorter than their zoom: s01 (0.8 s action, short caption) would start
  // zooming out mid zoom-in; s02 (holdFirst by hand, no ring) would end zoomed in.
  // One-character captions last 1.0667 s, which rounds start and length apart.
  const r = project({
    timeline: [{ startMs: 500, endMs: 1300 }, { startMs: 3000, endMs: 4000 }, { startMs: 6000, endMs: 6500 }],
    plan: { ...PLAN, steps: [{ id: 's01', caption: 'G', zoom: {} }, { id: 's02', caption: 'Click it now ok', holdFirst: true, zoom: { at: 0.45 } }, { id: 's03', caption: 'x' }] },
  }).build();
  check(!r.error && zoomOk(r.scene('step-s01'), 's01') && zoomOk(r.scene('step-s02'), 's02'), 'a step shorter than its zoom still zooms in, then out, inside the step');
  const hs = hosts(r.html ?? '');
  check(hs.length === 5 && hs.every((h, i) => i === 4 || h.start + h.dur === hs[i + 1].start), 'scene hosts meet exactly when rounding would leave a 1 ms gap');
}
const withIds = (a, b) => project({ plan: { ...PLAN, steps: [{ ...PLAN.steps[0], id: a }, { ...PLAN.steps[1], id: b }, PLAN.steps[2]] } }).build().error ?? '';
check(/"s 1".*letters, digits/.test(withIds('s 1', 's02')), 'a step id unsafe as a file name is refused');
check(/"s01", "S01".*clash/.test(withIds('s01', 'S01')), 'step ids that differ only in case are refused');
check(withIds(1, 's02') === '', 'a numeric step id builds');
check(/letters, digits/.test(withIds(undefined, 's02')), 'a missing step id is refused with a reason');
check(/mask\.after 30 is past the end/.test(project({ plan: { ...PLAN, steps: [{ ...PLAN.steps[0], mask: { x: 1, y: 1, w: 9, h: 9, text: 'x', after: 30 } }, PLAN.steps[1], PLAN.steps[2]] } }).build().error ?? ''), 'a mask that would start after its step is refused');
check(/must match 1:1/.test(project({ timeline: TIMELINE.slice(0, 2) }).build().error ?? ''), 'plan/timeline step-count mismatch is refused');
check(/past the end of the footage/.test(project({ timeline: [...TIMELINE.slice(0, 2), { label: 'x', startMs: 12000, endMs: 14000 }] }).build().error ?? ''), 'a step past the end of the footage is refused');
check(/only 0 tap/.test(project({ clicks: [] }).build().error ?? ''), 'ring: true on a step without taps is refused');

{
  // Themes fill brand; brand keys win; glows move only when asked.
  const html = (config) => {
    const r = project({ config }).build();
    if (r.error) console.error(r.error);
    return r.html ?? '';
  };
  const DEFAULT_LOOK = ['--bg: #0f172a;', '--accent: #22c55e;', 'at 78% 18%', '.glow { position: absolute; width: 900px; height: 900px; left: -260px; top: 420px;'];
  check(DEFAULT_LOOK.every((s) => html({}).includes(s)), 'example config (theme navy, empty brand): default look');
  const pre = { bg: '#0f172a', bg2: '#1e293b', glow: '#334155', accent: '#22c55e', onAccent: '#052e16', ink: '#f8fafc', captionBg: 'rgba(2,6,23,0.82)' };
  check(DEFAULT_LOOK.every((s) => html({ theme: undefined, brand: pre }).includes(s)), 'pre-theme config (no theme key, full brand): default look unchanged');
  const old = project({ config: { theme: 'purple', brand: pre } }).build();
  check(old.html?.includes('--bg: #0f172a;') && /brand sets every colour/.test(old.warnings), 'theme hidden by old brand colours warns');
  const one = project({ config: { brand: { accent: '#ff0000' } } }).build();
  check(one.html?.includes('--accent: #ff0000;') && !/theme/.test(one.warnings), 'overriding one colour stays quiet');
  check(html({ theme: 'teal' }).includes('--bg: #042f2e;'), 'theme alone works on the example config');
  const purple = html({ theme: 'purple', brand: { accent: '#ff0000', ink: null } });
  check(purple.includes('--bg: #1e1033;') && purple.includes('--accent: #ff0000;') && purple.includes('--ink: #faf5ff;'), 'theme fills brand, brand keys override it, null keeps the theme value');
  const moved = html({ brand: { glowAt: [1500, 200], glow2: { x: 1700, y: 900, size: 600, color: '#a78bfa55' } } });
  check(moved.includes('at 1500px 200px') && moved.includes('.glow { position: absolute; width: 600px; height: 600px; left: 1400px; top: 600px;') && moved.includes('#a78bfa55 0%'), 'glowAt / glow2 place both glows');
  check(/unknown theme "pink".*navy, purple, teal, blue/.test(project({ config: { theme: 'pink' } }).build().error ?? ''), 'an unknown theme is refused with the list');
  check(/unknown theme "constructor"/.test(project({ config: { theme: 'constructor' } }).build().error ?? ''), 'an inherited name is not a theme');
  check(/glowAt must be \[x, y\]/.test(project({ config: { brand: { glowAt: '78% 18%' } } }).build().error ?? ''), 'a malformed glowAt is refused');
  const refused = (brand, re) => re.test(project({ config: { brand } }).build().error ?? '');
  check(refused({ glow2: { x: '1700px' } }, /glow2\.x must be a number/), 'a non-numeric glow2 field is refused');
  check(refused({ glow2: [1700, 900, 600] }, /glow2 must be \{x, y, size, color\}/), 'glow2 given as an array is refused');
  check(refused({ glow2: { size: -600 } }, /size must be above 0/), 'a glow2 size of 0 or less is refused');
  check(refused({ glow2: { color: '' } }, /color must be a CSS colour/), 'an empty glow2 colour is refused');
  check(refused({ glowAt: 0 }, /glowAt must be \[x, y\]/), 'a falsy glowAt is refused, not ignored');
  check(/brand must be an object/.test(project({ config: { brand: 'purple' } }).build().error ?? ''), 'a theme name put in brand is refused');
}

// Narration + music: build.mjs installs @hyperframes/core (pinned to the CLI) before the carve, once.
// A fake HOME holds a carve.mjs that needs core; fake npx/npm on PATH stand in for the network.
if (process.platform !== 'win32') {
  const home = mkdtempSync(join(tmpdir(), 'tvideo-home-'));
  const bin = mkdtempSync(join(tmpdir(), 'tvideo-bin-'));
  const scripts = join(home, '.claude/skills/hyperframes-audio/scripts');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, 'carve.mjs'), "import { existsSync, writeFileSync } from 'node:fs';\nif (!existsSync('node_modules/@hyperframes/core/package.json')) process.exit(1);\nwriteFileSync('carved', '');\n");
  writeFileSync(join(bin, 'npx'), '#!/bin/sh\necho "npm warn noise"\necho "${FAKE_VERSION:-0.8.217}"\n', { mode: 0o755 });
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\necho "$*" >> npm.log\n[ -n "$FAKE_NPM_FAIL" ] && exit 1\nmkdir -p node_modules/@hyperframes/core && echo {} > node_modules/@hyperframes/core/package.json\n', { mode: 0o755 });
  const env = { HOME: home, PATH: `${bin}:${process.env.PATH}` };
  const narrated = () => {
    const p = project({ voices: { s03: { path: 'assets/v.mp3', duration: 6 } }, config: { music: { src: 'assets/m.mp3' } } });
    writeFileSync(join(p.dir, 'assets/m.mp3'), '');
    return p;
  };
  const npmLog = (p) => (existsSync(join(p.dir, 'npm.log')) ? readFileSync(join(p.dir, 'npm.log'), 'utf8').trim().split('\n') : []);
  const p = narrated();
  p.build(env);
  check(npmLog(p).join() === 'i -D @hyperframes/core@0.8.217' && existsSync(join(p.dir, 'carved')), 'missing core is installed at the CLI version, then carved');
  p.build(env);
  check(npmLog(p).length === 1, 'core already present is not installed again');
  const bad = narrated().build({ ...env, FAKE_NPM_FAIL: '1' });
  check(bad.html && /carve failed/.test(bad.warnings), 'a failed install warns and the build still succeeds');
  const odd = narrated();
  const r = odd.build({ ...env, FAKE_VERSION: '--force' });
  check(r.html && /carve failed/.test(r.warnings) && npmLog(odd).length === 0, 'an unexpected version string is never passed to npm');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nbuild tests passed');
