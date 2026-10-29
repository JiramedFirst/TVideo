import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

/**
 * After a real take, copy each clip's folder out of the Playwright output dir
 * into recordings/<timestamp>/ — Playwright wipes that dir at the start of the
 * next run, which would otherwise destroy the take.
 *
 * A clip folder is any folder holding the video.webm + timeline.json a filmed clip
 * writes (timeline.ts), whatever Playwright named it — so this also works when the
 * clips live in an existing project with its own testDir and outputDir. Only
 * folders written by this run count: Playwright wipes just the projects it ran, so
 * another project's outputDir can still hold last week's take.
 *
 * `recordings` sits next to the config file; TV_RECORDINGS_DIR moves it (a relative
 * path is taken from the config's folder too).
 */
export default function globalTeardown(config: FullConfig) {
  if (process.env.TV_REHEARSE === '1') return;
  // Teardown runs in the runner's process, so its start time is this run's start.
  const runStart = Date.now() - process.uptime() * 1000;
  const base = dirname(config.configFile ?? join(process.cwd(), 'x'));
  const clips: string[] = [], noVideo: string[] = [];
  let older = 0;
  for (const d of new Set(config.projects.map((p) => p.outputDir))) {
    if (!existsSync(d)) continue;
    for (const c of readdirSync(d).map((n) => join(d, n))) {
      const t = statSync(join(c, 'timeline.json'), { throwIfNoEntry: false });
      if (!t) continue;
      if (t.mtimeMs < runStart) older++;
      else if (!existsSync(join(c, 'video.webm'))) noVideo.push(basename(c));
      else clips.push(c);
    }
  }
  // Said out loud: the next run wipes these folders, so a silent skip loses a take.
  if (noVideo.length) console.warn(`! not saved, no video.webm (is video on for this project?): ${noVideo.join(', ')}`);
  if (older) console.log(`(skipped ${older} older clip folder(s) not written by this run)`);
  if (!clips.length) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dest = join(resolve(base, process.env.TV_RECORDINGS_DIR || 'recordings'), stamp);
  for (const c of clips) cpSync(c, join(dest, basename(c)), { recursive: true });
  console.log(`Saved ${clips.length} clip folder(s) to ${dest}/`);
}
