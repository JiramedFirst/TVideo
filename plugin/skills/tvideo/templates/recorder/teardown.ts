import { cpSync, existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { FullConfig } from '@playwright/test';

/**
 * After a real take, copy each clip's folder out of the Playwright output dir
 * into recordings/<timestamp>/ — Playwright wipes that dir at the start of the
 * next run, which would otherwise destroy the take.
 *
 * A clip folder is any folder holding the timeline.json that timeline.ts writes,
 * whatever Playwright named it — so this also works when the clips live in an
 * existing project with its own testDir and outputDir. TV_RECORDINGS_DIR moves
 * the destination (default `recordings`).
 */
export default function globalTeardown(config: FullConfig) {
  if (process.env.TV_REHEARSE === '1') return;
  const outDirs = [...new Set(config.projects.map((p) => p.outputDir))].filter((d) => existsSync(d));
  const clips = outDirs.flatMap((d) => readdirSync(d).map((c) => join(d, c)).filter((c) => existsSync(join(c, 'timeline.json'))));
  if (!clips.length) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dest = join(process.env.TV_RECORDINGS_DIR || 'recordings', stamp);
  for (const c of clips) cpSync(c, join(dest, basename(c)), { recursive: true });
  console.log(`Saved ${clips.length} clip folder(s) to ${dest}/`);
}
