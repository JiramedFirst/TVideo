import { writeFile } from 'node:fs/promises';
import { test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { REHEARSE, clickLog, installCursor } from './cursor';

/**
 * Smooth-scroll `target` into view before acting on it. Playwright's own
 * auto-scroll is instant, which reads as a jump cut in the recording (the viewer
 * loses their place on the page). scrollIntoView picks whichever ancestor
 * actually scrolls (often an app shell's <main>, not the window).
 */
export async function glideTo(page: Page, target: Locator, settleMs = 1100): Promise<void> {
  await target.evaluate((el, smooth) => el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' }), !REHEARSE);
  if (!REHEARSE) await page.waitForTimeout(settleMs);
}

/** A readable pause after a key moment; zero in rehearsal. */
export function hold(page: Page, ms = 1200): Promise<void> {
  return REHEARSE ? Promise.resolve() : page.waitForTimeout(ms);
}

/**
 * Caption timeline for one recording. Create it as the FIRST line of the test
 * body: Playwright's video starts when the page is created, so t0 here is the
 * video's t=0 to within fixture setup time. Writes `timeline.json` (one entry
 * per step: label + startMs/endMs) and `clicks.json` (ms of every `tap`) next to
 * the video — the editor builds the whole cut from those two files.
 *
 * Also installs the visible cursor and hides framework dev badges (Next.js
 * dev-tools, Vite overlay) that would otherwise sit in every frame.
 */
export function createTimeline(testInfo: TestInfo, page: Page, accent?: string) {
  const t0 = Date.now();
  clickLog.length = 0;
  void installCursor(page, accent);
  void page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal, vite-error-overlay { display: none !important; }';
      document.head.append(style);
    });
  });
  const steps: { label: string; startMs: number; endMs: number }[] = [];
  return {
    async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const startMs = Date.now() - t0;
      try {
        return await test.step(label, fn);
      } finally {
        steps.push({ label, startMs, endMs: Date.now() - t0 });
      }
    },
    async save() {
      const clicks = clickLog.map((t) => t - t0);
      const body = JSON.stringify(steps, null, 2);
      await writeFile(testInfo.outputPath('timeline.json'), body);
      await writeFile(testInfo.outputPath('clicks.json'), JSON.stringify(clicks));
      await testInfo.attach('timeline.json', { body, contentType: 'application/json' });
    },
  };
}

/**
 * A date `offsetDays` from today (in `timeZone`), skipped forward to a weekday.
 * Apps with booking windows ("tomorrow … +7 days") enforce them against the real
 * clock — a hardcoded demo date goes un-pickable within days.
 */
export function relativeDay(offsetDays: number, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const local = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone }));
  const today = local(new Date());
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    dmy: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`,
    day: d.getDate(),
    monthsAhead: (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth(),
  };
}
