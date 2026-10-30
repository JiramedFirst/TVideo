import { test, expect, type Browser, type Page } from '@playwright/test';
import { clickLog, installCursor } from '../cursor';
import { pickDate, pickMonth } from '../pickers';

// Copied into the recorder as checks/ by tests/smoke.mjs, so ../ is the recorder template.
const HTML = `<body style="margin:0;font:14px system-ui;height:600px">
<input id="m" type="month" min="2026-03" value="2026-10" style="position:absolute;left:40px;top:20px">
<input id="d" type="date" min="2026-10-05" value="2026-10-30" style="position:absolute;left:300px;top:20px">
<input id="b" type="date" min="2026-10-05" value="2026-10-30" style="position:absolute;left:300px;top:540px">
</body>`;

async function setup(browser: Browser, locale: string) {
  const ctx = await browser.newContext({ locale, viewport: { width: 700, height: 600 } });
  await installCursor(ctx);
  const page = await ctx.newPage();
  await page.setContent(HTML);
  await page.evaluate(() => document.querySelectorAll('input').forEach((el) =>
    el.addEventListener('change', () => { el.dataset.changes = String(Number(el.dataset.changes ?? 0) + 1); })));
  return page;
}

/** Run a pick; while the mock is open, return its box and text. */
async function pick(page: Page, run: Promise<void>) {
  const pop = page.locator('#tvideo-picker .pop');
  await pop.waitFor();
  const seen = { box: (await pop.boundingBox())!, text: await pop.innerText() };
  await run;
  return seen;
}

async function committed(page: Page, id: string, value: string) {
  await expect(page.locator(`#${id}`)).toHaveValue(value);
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-changes', /[1-9]/);
  await expect(page.locator('#tvideo-picker')).toHaveCount(0);
}

test('pickMonth / pickDate draw the mock, tap through it and set the real value', async ({ browser }) => {
  const th = await setup(browser, 'th-TH');
  const taps = clickLog.length;
  const month = await pick(th, pickMonth(th, th.locator('#m'), '2026-12'));
  expect(month.text).toContain('เดือนนี้');
  await committed(th, 'm', '2026-12');

  // Two months ahead: two ↓ taps, then the day.
  await pick(th, pickDate(th, th.locator('#d'), '2026-12-04'));
  await committed(th, 'd', '2026-12-04');
  expect(clickLog.length - taps).toBe(1 + 3);

  // A field near the bottom edge: the mock opens above it.
  const field = (await th.locator('#b').boundingBox())!;
  const flipped = await pick(th, pickDate(th, th.locator('#b'), '2026-11-04'));
  expect(flipped.box.y + flipped.box.height).toBeLessThanOrEqual(field.y + 1);
  await committed(th, 'b', '2026-11-04');

  await expect(pickDate(th, th.locator('#d'), '2026-10-01')).rejects.toThrow(/outside/);
  await expect(pickMonth(th, th.locator('#m'), '2026-13')).rejects.toThrow(/not YYYY-MM/);

  const en = await setup(browser, 'en-US');
  const date = await pick(en, pickDate(en, en.locator('#d'), '2026-10-12', { labels: { today: 'Now' } }));
  expect(date.text).toContain('Clear');
  expect(date.text).toContain('Now');
  await committed(en, 'd', '2026-10-12');
});
