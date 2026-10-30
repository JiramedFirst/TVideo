import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { clickLog, installCursor } from '../cursor';
import { pickFiles } from '../file-dialog';

// Copied into the recorder as checks/ by tests/smoke.mjs, so ../ is the recorder template.
const HTML = `<body style="margin:0;font:14px system-ui;height:600px">
<input id="one" type="file"><input id="many" type="file" multiple>
</body>`;

const contexts: BrowserContext[] = [];
test.afterEach(() => Promise.all(contexts.splice(0).map((c) => c.close())));
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

const dir = mkdtempSync(join(tmpdir(), 'tvideo-fd-'));
const a = join(dir, 'invoice-october.pdf');
const b = join(dir, 'ใบแจ้งหนี้-2026-10.png');
writeFileSync(a, 'a'.repeat(24_000));
writeFileSync(b, 'b'.repeat(900));

async function setup(browser: Browser, locale: string, html = HTML) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1000, height: 600 } });
  contexts.push(ctx);
  await installCursor(ctx);
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.evaluate(() => document.querySelectorAll('input').forEach((el) =>
    el.addEventListener('change', () => { el.dataset.changes = String(Number(el.dataset.changes ?? 0) + 1); })));
  return page;
}

/** Run a pick; while the mock is open, return its text. A pick that fails first fails here. */
async function pick(page: Page, run: Promise<void>) {
  const pop = page.locator('#tvideo-filedialog .panel');
  const seen = await Promise.race([
    pop.waitFor().then(async () => ({ text: await pop.innerText() })),
    run.then(() => { throw new Error('pick finished before its panel was seen'); }),
  ]);
  await run;
  return seen;
}

const names = (page: Page, id: string) => page.locator(`#${id}`).evaluate((el: HTMLInputElement) => [...el.files!].map((f) => f.name));

test('pickFiles draws the panel, taps rows + Open and sets the real files', async ({ browser }) => {
  const th = await setup(browser, 'th-TH');
  const taps = clickLog.length;
  const one = await pick(th, pickFiles(th, th.locator('#one'), a));
  expect(one.text).toContain('invoice-october.pdf');
  expect(one.text).toContain('24 KB');
  expect(one.text).toContain('เปิด');
  expect(await names(th, 'one')).toEqual(['invoice-october.pdf']);
  await expect(th.locator('#one')).toHaveAttribute('data-changes', /[1-9]/);
  await expect(th.locator('#tvideo-filedialog')).toHaveCount(0);
  expect(clickLog.length - taps).toBe(1 + 1 + 1);

  const before = clickLog.length;
  const many = await pick(th, pickFiles(th, th.locator('#many'), [a, b]));
  expect(many.text).toContain('ใบแจ้งหนี้-2026-10.png');
  expect(await names(th, 'many')).toEqual(['invoice-october.pdf', 'ใบแจ้งหนี้-2026-10.png']);
  await expect(th.locator('#many')).toHaveAttribute('data-changes', /[1-9]/);
  await expect(th.locator('#tvideo-filedialog')).toHaveCount(0);
  expect(clickLog.length - before).toBe(1 + 2 + 1);

  await expect(pickFiles(th, th.locator('#one'), join(dir, 'missing.pdf'))).rejects.toThrow(/does not exist/);
  await expect(pickFiles(th, th.locator('#one'), dir)).rejects.toThrow(/not a file/);
  await expect(pickFiles(th, th.locator('#one'), [a, b])).rejects.toThrow(/not "multiple"/);
  await expect(th.locator('#tvideo-filedialog')).toHaveCount(0);
  await expect(pickFiles(th, th.locator('#one'), a, { os: 'windows' as 'macos' })).rejects.toThrow('pickFiles: os "windows" is not supported yet (macos)');

  const en = await setup(browser, 'en-US');
  const text = (await pick(en, pickFiles(en, en.locator('#one'), a))).text;
  expect(text).toContain('Open');
  expect(text).toContain('PDF document');
  expect(await names(en, 'one')).toEqual(['invoice-october.pdf']);
});

test('under CSP style-src self the rows still have a box', async ({ browser }) => {
  const page = await setup(browser, 'en-US', `<head><meta http-equiv="Content-Security-Policy" content="style-src 'self'"></head>${HTML}`);
  const row = page.locator('#tvideo-filedialog .row');
  let width = 0;
  page.locator('#tvideo-filedialog .panel').waitFor().then(async () => { width = (await row.boundingBox())?.width ?? 0; }, () => {});
  await pick(page, pickFiles(page, page.locator('#one'), a));
  expect(width).toBeGreaterThan(100);
  expect(await names(page, 'one')).toEqual(['invoice-october.pdf']);
});

test('a trigger that removes itself on click does not hang the pick', async ({ browser }) => {
  const page = await setup(browser, 'en-US', `<body style="margin:0;height:600px"><button id=btn>Upload</button><input id=one type=file hidden>
<script>btn.onclick = () => { one.click(); btn.remove(); };</script></body>`);
  await pick(page, pickFiles(page, page.locator('#btn'), a));
  expect(await names(page, 'one')).toEqual(['invoice-october.pdf']);
});

test('files that do not match accept are refused before the panel is drawn', async ({ browser }) => {
  const page = await setup(browser, 'en-US', '<body><input id=one type=file accept=".pdf"><input id=img type=file accept="image/*"></body>');
  await expect(pickFiles(page, page.locator('#one'), b)).rejects.toThrow(/does not match accept/);
  await expect(page.locator('#tvideo-filedialog')).toHaveCount(0);
  // An extension we have no mime for is let through for mime entries; Chrome would know it.
  const svg = join(dir, 'logo.svg');
  writeFileSync(svg, '<svg/>');
  await pick(page, pickFiles(page, page.locator('#img'), svg));
  expect(await names(page, 'img')).toEqual(['logo.svg']);
});

test('a trigger inside a modal dialog keeps the panel in that dialog, even when the input is outside', async ({ browser }) => {
  const page = await setup(browser, 'en-US', `<body style="margin:0;height:600px"><input id=one type=file hidden>
<dialog id=dlg><button id=btn>Upload</button></dialog><script>btn.onclick = () => one.click(); dlg.showModal();</script></body>`);
  await pick(page, pickFiles(page, page.locator('#btn'), a));
  expect(await names(page, 'one')).toEqual(['invoice-october.pdf']);
});
