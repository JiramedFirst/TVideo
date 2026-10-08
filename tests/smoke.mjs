// Smoke test: the whole TVideo pipeline on the repo's demo app, minus the final
// render. Serves examples/demo-app, rehearses + records the example clip with the
// recorder template, imports it into the editor template, builds the composition
// and checks what came out. Same script CI runs.
//
//   node tests/smoke.mjs
//
// Needs Node ≥ 20, ffmpeg/ffprobe, and Playwright's chromium (`npx playwright
// install chromium`). Set TV_SMOKE_NODE_MODULES to an existing node_modules with
// @playwright/test to skip the npm install.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SKILL = join(ROOT, 'plugin/skills/tvideo');
const APP = join(ROOT, 'examples/demo-app');
const work = mkdtempSync(join(tmpdir(), 'tvideo-smoke-'));
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`ok   ${msg}`);

// 1. Serve the demo app on a free port.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(APP, path.endsWith('/') ? `${path}index.html` : path);
  if (!file.startsWith(APP) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
ok(`demo app at ${base}`);

try {
  // 2. Recorder: copy the template, install, rehearse, record.
  const rec = join(work, 'recorder');
  cpSync(join(SKILL, 'templates/recorder'), rec, { recursive: true });
  if (process.env.TV_SMOKE_NODE_MODULES) symlinkSync(resolve(process.env.TV_SMOKE_NODE_MODULES), join(rec, 'node_modules'));
  else execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: rec, stdio: 'inherit' });
  // Async on purpose: the demo server lives in this process, and a *Sync spawn
  // would block its event loop — every page load would hang until timeout.
  const run = (extra) => new Promise((done) =>
    spawn('npx', ['playwright', 'test'], { cwd: rec, stdio: 'inherit', env: { ...process.env, TV_BASE_URL: base, ...extra } })
      .on('exit', (code) => done(code)));
  if ((await run({ TV_REHEARSE: '1' })) !== 0) fail('rehearsal failed');
  ok('rehearsal passed');
  if ((await run({})) !== 0) fail('recording failed');
  const clipDir = readdirSync(join(rec, 'test-results')).find((d) => d.startsWith('clips-01-'));
  if (!clipDir) fail('no clip output in test-results/');
  const out = join(rec, 'test-results', clipDir);
  for (const f of ['video.webm', 'timeline.json', 'clicks.json']) if (!existsSync(join(out, f))) fail(`recording is missing ${f}`);
  const timeline = JSON.parse(readFileSync(join(out, 'timeline.json'), 'utf8'));
  const clicks = JSON.parse(readFileSync(join(out, 'clicks.json'), 'utf8'));
  if (timeline.length !== 5) fail(`expected 5 steps, got ${timeline.length}`);
  if (clicks.length < 5) fail(`expected ≥5 logged clicks, got ${clicks.length}`);
  ok(`recorded ${timeline.length} steps, ${clicks.length} clicks`);

  // 3. Editor: copy the template, import, build.
  const prj = join(work, 'clip');
  cpSync(join(SKILL, 'templates/editor'), prj, { recursive: true });
  cpSync(join(prj, 'tvideo.config.example.json'), join(prj, 'tvideo.config.json'));
  cpSync(join(prj, 'plan.example.json'), join(prj, 'plan.json'));
  execFileSync('bash', [join(SKILL, 'scripts/import.sh'), out, prj], { stdio: 'inherit' });
  execFileSync('node', ['build.mjs'], { cwd: prj, stdio: 'inherit' });
  const html = readFileSync(join(prj, 'index.html'), 'utf8');
  const caps = html.match(/id="cap-s\d+"/g) ?? [];
  const rings = html.match(/id="ring-s\d+"/g) ?? [];
  const total = Number(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/.exec(html)?.[1]);
  if (caps.length !== 5) fail(`expected 5 captions, got ${caps.length}`);
  if (rings.length !== 2) fail(`expected 2 highlight rings, got ${rings.length}`);
  if (!(total > 20 && total < 90)) fail(`unexpected duration ${total}s`);
  if (!existsSync(join(prj, 'assets/holds'))) fail('no hold stills extracted');
  ok(`built ${total}s composition: ${caps.length} captions, ${rings.length} rings`);
  console.log(`\nsmoke passed — work dir ${work}`);
} finally {
  server.close();
}
