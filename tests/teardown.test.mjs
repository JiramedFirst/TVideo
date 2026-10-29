// Test of the recorder's globalTeardown alone: fake Playwright output folders,
// no browser. Covers which folders count as takes (any name, as long as the
// clip wrote timeline.json), rehearsals, and TV_RECORDINGS_DIR.
//
//   node --experimental-strip-types tests/teardown.test.mjs
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { default: globalTeardown } = await import(resolve(import.meta.dirname, '../plugin/skills/tvideo/templates/recorder/teardown.ts'));
let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failed++;
};

/** A project dir with one output folder per [name, holdsTimeline]; returns {dir, config}. */
function fixture(folders, outputDir = 'test-results') {
  const dir = mkdtempSync(join(tmpdir(), 'tvideo-teardown-'));
  for (const [name, take] of folders) {
    mkdirSync(join(dir, outputDir, name), { recursive: true });
    writeFileSync(join(dir, outputDir, name, 'video.webm'), '');
    if (take) writeFileSync(join(dir, outputDir, name, 'timeline.json'), '[]');
  }
  const out = join(dir, outputDir);
  // The shape Playwright passes: every project carries its resolved outputDir.
  return { dir, config: { rootDir: dir, projects: [{ name: 'setup', outputDir: out }, { name: 'clips', outputDir: out }] } };
}
const run = (fx, env = {}) => {
  const cwd = process.cwd(), saved = { ...process.env };
  Object.assign(process.env, env);
  process.chdir(fx.dir);
  try { globalTeardown(fx.config); } finally { process.chdir(cwd); process.env = saved; }
};
const takes = (root) => (existsSync(root) ? readdirSync(root).flatMap((ts) => readdirSync(join(root, ts))) : []);

{
  // An embedded project names folders after its own spec paths, not clips-*.
  const fx = fixture([['tutorials-orders-create-chromium', true], ['auth.setup-chromium', false]], 'e2e-output');
  run(fx);
  const got = takes(join(fx.dir, 'recordings'));
  check(got.join() === 'tutorials-orders-create-chromium', `a take with any folder name is saved; the setup folder is not (${got.join() || 'none'})`);
}
{
  const fx = fixture([['clips-01-orders', true]]);
  run(fx, { TV_RECORDINGS_DIR: 'takes/tvideo' });
  check(takes(join(fx.dir, 'takes/tvideo')).join() === 'clips-01-orders' && !existsSync(join(fx.dir, 'recordings')), 'TV_RECORDINGS_DIR picks the destination');
}
{
  const fx = fixture([['clips-01-orders', true]]);
  run(fx, { TV_REHEARSE: '1' });
  check(!existsSync(join(fx.dir, 'recordings')), 'a rehearsal saves nothing');
}
{
  const fx = fixture([]);
  run(fx);
  check(!existsSync(join(fx.dir, 'recordings')), 'a missing output folder saves nothing and does not throw');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nteardown tests passed');
