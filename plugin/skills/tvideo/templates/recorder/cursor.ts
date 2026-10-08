import type { Locator, Page } from '@playwright/test';

/**
 * A visible mouse for tutorial recordings. Playwright's video has no cursor, so a
 * viewer can't see WHERE a click happened. This draws an arrow that follows the
 * real (Playwright-driven) mouse plus a ripple on each press, and `tap`/`typeInto`
 * glide to a control before using it so the eye can follow.
 *
 * Installed with addInitScript, so it is rebuilt on every navigation; the last
 * position lives in sessionStorage so the arrow doesn't jump to a corner after a
 * page change.
 */
export async function installCursor(page: Page, accent = '#93d600'): Promise<void> {
  await page.addInitScript((color: string) => {
    const KEY = 'tvideo.cursor';
    const mount = () => {
      const arrow = document.createElement('div');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.style.cssText =
        'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;' +
        'transition:transform 40ms linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))';
      arrow.innerHTML =
        '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 9.5-6.6 1.4 3.9 7.6-2.9 1.5-3.9-7.6L4 19z" ' +
        'fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.append(arrow);
      const place = (x: number, y: number) => {
        arrow.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
        sessionStorage.setItem(KEY, JSON.stringify([x, y]));
      };
      const saved = sessionStorage.getItem(KEY);
      const [sx, sy] = saved ? (JSON.parse(saved) as [number, number]) : [640, 400];
      place(sx, sy);
      window.addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
      window.addEventListener(
        'mousedown',
        (e) => {
          const ring = document.createElement('div');
          ring.style.cssText =
            `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;` +
            `border:3px solid ${color};background:${color}40;z-index:2147483646;pointer-events:none;` +
            'transition:transform 450ms ease-out,opacity 450ms ease-out';
          document.body.append(ring);
          requestAnimationFrame(() => {
            ring.style.transform = 'scale(1.8)';
            ring.style.opacity = '0';
          });
          setTimeout(() => ring.remove(), 500);
        },
        true,
      );
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }, accent);
}

/** Rehearsal runs (TV_REHEARSE=1) skip the glides and pauses: they only prove every selector resolves. */
export const REHEARSE = process.env.TV_REHEARSE === '1';

/** Glide the mouse to the centre of `target` (steps keep the motion visible). */
export async function pointAt(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  if (REHEARSE) return;
  const box = await target.boundingBox();
  if (!box) throw new Error('pointAt: target has no bounding box (not visible?)');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await page.waitForTimeout(250);
}

/**
 * Wall-clock time of every `tap`, so the editor can lay a click sound exactly on
 * each on-screen press. createTimeline resets it and saves it relative to t0.
 */
export const clickLog: number[] = [];

/** Glide to `target`, pause so the viewer sees where, then click it. */
export async function tap(page: Page, target: Locator): Promise<void> {
  await pointAt(page, target);
  clickLog.push(Date.now());
  await target.click();
}

/** Glide to a field, click into it, and type at a readable pace. */
export async function typeInto(page: Page, target: Locator, text: string): Promise<void> {
  await tap(page, target);
  await target.pressSequentially(text, { delay: REHEARSE ? 0 : 90 });
}
