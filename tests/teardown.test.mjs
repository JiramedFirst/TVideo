// Test of the recorder's globalTeardown alone: fake Playwright output folders,
// no browser. Covers which folders count as takes (any name, as long as the clip
// wrote video.webm + timeline.json during this run), rehearsals, where takes go
// (next to the config, or TV_RECORDINGS_DIR) and a call without a config.
//
//   node --experimental-strip-types tests/teardown.test.mjs
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { default: globalTeardown } = await import(resolve(import.meta.dirname, '../plugin/skills/tvideo/templates/recorder/teardown.ts'));
let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failed++;
};

/**
 * A project dir with one output folder per [name, files, stale]; returns {dir, config}.
 * files: 'take' = video.webm + timeline.json, 'novideo' = timeline.json only, 'setup' = video.webm only.
 */
function fixture(folders, outputDir = 'test-results') {
  const dir = mkdtempSync(join(tmpdir(), 'tvideo-teardown-'));
  for (const [name, files, stale] of folders) {
    const f = join(dir, outputDir, name);
    mkdirSync(f, { recursive: true });
    if (files !== 'novideo') writeFileSync(join(f, 'video.webm'), 'v');
    if (files !== 'setup') writeFileSync(join(f, 'timeline.json'), '[]');
    // A take from an earlier run, in a project this run didn't wipe.
    if (stale && files !== 'setup') utimesSync(join(f, 'timeline.json'), new Date(Date.now() - 86_400_000), new Date(Date.now() - 86_400_000));
  }
  const out = join(dir, outputDir);
  // The shape Playwright passes: the config file's path and every project's resolved outputDir.
  return { dir, config: { configFile: join(dir, 'playwright.config.ts'), rootDir: dir, projects: [{ name: 'setup', outputDir: out }, { name: 'clips', outputDir: out }] } };
}
// Runs from an unrelated cwd with only the given TV_* vars, so the developer's own
// shell (an exported TV_RECORDINGS_DIR / TV_REHEARSE) can neither skew a check nor
// receive fake takes.
const away = mkdtempSync(join(tmpdir(), 'tvideo-teardown-cwd-'));
const run = (config, env = {}) => {
  const cwd = process.cwd(), keys = ['TV_RECORDINGS_DIR', 'TV_REHEARSE'], saved = keys.map((k) => process.env[k]);
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  process.chdir(away);
  try { globalTeardown(config); } finally {
    process.chdir(cwd);
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
  }
};
const takes = (root) => (existsSync(root) ? readdirSync(root).flatMap((ts) => readdirSync(join(root, ts)).map((c) => join(root, ts, c))) : []);
const names = (list) => list.map((p) => p.split(/[\\/]/).pop()).sort().join();

{
  // An embedded project names folders after its own spec paths, not clips-*.
  const fx = fixture([['tutorials-orders-create-chromium', 'take'], ['auth.setup-chromium', 'setup'], ['tutorials-draft-chromium', 'novideo']], 'e2e-output');
  run(fx.config);
  const got = takes(join(fx.dir, 'recordings'));
  check(names(got) === 'tutorials-orders-create-chromium', `a take with any folder name is saved next to the config, not the cwd; setup and video-less folders are not (${names(got) || 'none'})`);
  check(got.length === 1 && existsSync(join(got[0], 'video.webm')) && existsSync(join(got[0], 'timeline.json')), 'the saved take holds its video and timeline');
  check(!existsSync(join(away, 'recordings')), 'nothing lands in the cwd');
}
{
  const fx = fixture([['clips-01-new', 'take'], ['clips-02-old', 'take', true]]);
  run(fx.config);
  check(names(takes(join(fx.dir, 'recordings'))) === 'clips-01-new', 'a take left from an earlier run is not saved again');
}
{
  const fx = fixture([['clips-01-orders', 'take']]);
  run(fx.config, { TV_RECORDINGS_DIR: 'takes/tvideo' });
  check(names(takes(join(fx.dir, 'takes/tvideo'))) === 'clips-01-orders' && !existsSync(join(fx.dir, 'recordings')), 'TV_RECORDINGS_DIR picks the destination (relative to the config)');
}
{
  const fx = fixture([['clips-01-orders', 'take']]);
  run(fx.config, { TV_REHEARSE: '1' });
  check(!existsSync(join(fx.dir, 'recordings')), 'a rehearsal saves nothing');
}
{
  const fx = fixture([]);
  run(fx.config);
  check(!existsSync(join(fx.dir, 'recordings')), 'a missing output folder saves nothing and does not throw');
}
{
  // Chained from another teardown with no argument: falls back to ./test-results.
  mkdirSync(join(away, 'test-results', 'clips-01-x'), { recursive: true });
  writeFileSync(join(away, 'test-results', 'clips-01-x', 'video.webm'), 'v');
  writeFileSync(join(away, 'test-results', 'clips-01-x', 'timeline.json'), '[]');
  let threw = false;
  try { run(undefined); } catch { threw = true; }
  check(!threw && names(takes(join(away, 'recordings'))) === 'clips-01-x', 'called without a config, it saves ./test-results takes');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nteardown tests passed');
