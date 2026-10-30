import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { clickLog, installCursor } from '../cursor';
import { pickDate, pickMonth } from '../pickers';

// Copied into the recorder as checks/ by tests/smoke.mjs, so ../ is the recorder template.
const HTML = `<body style="margin:0;font:14px system-ui;height:600px">
<input id="m" type="month" min="2026-03" value="2026-10" style="position:absolute;left:40px;top:20px">
<input id="d" type="date" min="2026-10-05" value="2026-10-30" style="position:absolute;left:300px;top:20px">
<input id="p" type="date" min="2026-10-20" value="2026-11-15" style="position:absolute;left:40px;top:300px">
<input id="b" type="date" min="2026-10-05" value="2026-10-30" style="position:absolute;left:300px;top:540px">
<dialog id="dlg"><input id="x" type="date" value="2026-10-30"></dialog>
</body>`;

const contexts: BrowserContext[] = [];
test.afterEach(() => Promise.all(contexts.splice(0).map((c) => c.close())));

async function setup(browser: Browser, locale: string) {
  const ctx = await browser.newContext({ locale, viewport: { width: 700, height: 600 } });
  contexts.push(ctx);
  await installCursor(ctx);
  const page = await ctx.newPage();
  await page.setContent(HTML);
  await page.evaluate(() => document.querySelectorAll('input').forEach((el) =>
    el.addEventListener('change', () => { el.dataset.changes = String(Number(el.dataset.changes ?? 0) + 1); })));
  return page;
}

/** Run a pick; while the mock is open, return its box and text. A pick that fails first fails here. */
async function pick(page: Page, run: Promise<void>) {
  const pop = page.locator('#tvideo-picker .pop');
  const seen = await Promise.race([
    pop.waitFor().then(async () => ({ box: (await pop.boundingBox())!, text: await pop.innerText() })),
    run.then(() => { throw new Error('pick finished before its popup was seen'); }),
  ]);
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

  // Two months ahead: the field, two ↓ taps, then the day.
  await pick(th, pickDate(th, th.locator('#d'), '2026-12-04'));
  await committed(th, 'd', '2026-12-04');
  expect(clickLog.length - taps).toBe(2 + 4);

  // Back one month, where min falls inside that month: ↑ must stay enabled.
  await pick(th, pickDate(th, th.locator('#p'), '2026-10-25'));
  await committed(th, 'p', '2026-10-25');

  // A field near the bottom edge: the mock opens above it.
  const field = (await th.locator('#b').boundingBox())!;
  const flipped = await pick(th, pickDate(th, th.locator('#b'), '2026-11-04'));
  expect(flipped.box.y + flipped.box.height).toBeLessThanOrEqual(field.y + 1);
  await committed(th, 'b', '2026-11-04');

  // A field in a modal <dialog>: the mock must sit in the dialog to be clickable.
  await th.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).showModal());
  await pick(th, pickDate(th, th.locator('#x'), '2026-10-12'));
  await committed(th, 'x', '2026-10-12');

  await expect(pickDate(th, th.locator('#d'), '2026-10-01')).rejects.toThrow(/outside/);
  await expect(pickMonth(th, th.locator('#m'), '2026-13')).rejects.toThrow(/not YYYY-MM/);
  await expect(pickDate(th, th.locator('#d'), '2026-02-30')).rejects.toThrow(/not YYYY-MM-DD/);
  await expect(pickMonth(th, th.locator('#d'), '2026-12')).rejects.toThrow(/type="date"/);

  const en = await setup(browser, 'en-US');
  const date = await pick(en, pickDate(en, en.locator('#d'), '2026-10-12', { labels: { today: 'Now' } }));
  expect(date.text).toContain('Clear');
  expect(date.text).toContain('Now');
  await committed(en, 'd', '2026-10-12');
});
