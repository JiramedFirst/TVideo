import type { Locator, Page } from '@playwright/test';
import { REHEARSE, clickLog, pointAt, tap } from './cursor';

/**
 * Chrome's native month/date popups are separate OS windows, so Playwright's video
 * never shows them — the value just appears. These helpers draw a look-alike popup
 * in the page, tap through it with the recorder's cursor (clicks get logged + sounded),
 * then set the real value. The real input is never clicked: in headed mode that
 * would open the real popup on top of ours.
 */
export type PickerOptions = { locale?: string; labels?: { clear?: string; today?: string; thisMonth?: string } };

const HOST = '#tvideo-picker';

// Sizes/colours measured from Chrome on macOS (232x182 month, 218x281 date).
const CSS = `
.pop{position:fixed;box-sizing:border-box;background:#fff;border:1px solid #c4c4c4;border-radius:2px;
  box-shadow:0 6px 16px rgba(0,0,0,.28);font:16px/1 system-ui,-apple-system,sans-serif;color:#000;user-select:none}
.pop>*{position:absolute}
.pop.date{width:218px;height:281px}.pop.month{width:232px;height:182px}
button{all:unset;box-sizing:border-box;text-align:center;cursor:default}
button.oth{color:#777}button.off{color:#bbb}
.hd{left:10px;top:11px;height:24px;line-height:24px;font-weight:700}
.arr{top:9px;width:28px;height:28px;padding:2px}.arr svg{width:24px;height:24px;stroke:#111;fill:none;stroke-width:1.3}
.arr.off svg{stroke:#bbb}.arr.up{left:146px}.arr.down{left:178px}
.wk,.days{left:10px;display:grid;grid-template-columns:repeat(7,28px);grid-auto-rows:28px;line-height:28px;text-align:center}
.wk{top:45px;font-weight:700}.days{top:74px}
.days button{width:28px;height:28px;line-height:28px}
.yr{left:11px;top:11px;width:194px;height:25px;padding:0 8px;line-height:23px;background:#eee;border-bottom:1px solid #c8c8c8}
.mons{left:11px;top:37px;display:grid;grid-template-columns:repeat(4,48.5px);grid-auto-rows:34px}
.mons button{height:34px;line-height:30px;font-weight:700}
.mons button.off{font-weight:400}
.sel{background:#3b73ec;border:2px solid #2756bd;color:#fff!important;font-weight:700;border-radius:3px}
.sb{left:207px;top:62px;width:5px;height:31px;background:#d4d4d4;border-radius:2px}
.ft{display:flex;justify-content:space-between;color:#2f6fdd;height:24px;line-height:24px}
.date .ft{left:21px;right:21px;top:249px}.month .ft{left:20px;right:20px;top:151px}`;

type Mount = { kind: 'date' | 'month'; locale?: string; labels: PickerOptions['labels']; host: string; css: string };

/** Build the popup for `el`, leaving `__go(y,m)` on the host to jump views. Runs in the page. */
function mount(el: HTMLInputElement, c: Mount) {
  const loc = c.locale || navigator.language;
  const th = loc.startsWith('th');
  const L = { clear: th ? 'ล้าง' : 'Clear', today: th ? 'วันนี้' : 'Today', thisMonth: th ? 'เดือนนี้' : 'This month', ...c.labels };
  // Buddhist-era years would show 2569; Chrome's popup shows the Gregorian year.
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { calendar: 'gregory', ...o });
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const [vy, vm] = (el.value || iso(now)).split('-').map(Number);
  const view = { y: vy, m: vm - 1 }; // m is 0-based
  let picked = el.value;
  const ok = (v: string) => (!el.min || v >= el.min.slice(0, v.length)) && (!el.max || v <= el.max.slice(0, v.length));

  document.querySelector(c.host)?.remove(); // a failed earlier pick must not leave a second host
  const host = document.createElement('div');
  host.id = c.host.slice(1);
  // just under the cursor (…647) and its ripple (…646); clickable even when a modal disables the body
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483645;pointer-events:auto';
  const root = host.attachShadow({ mode: 'open' });
  // CSSOM, not a <style> tag: a CSP without 'unsafe-inline' would leave the popup unstyled.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(c.css);
  root.adoptedStyleSheets = [sheet];
  // Inside the field's modal: a <dialog> top layer or a modal's click-outside would block or close it.
  (el.closest('dialog,[role=dialog]') ?? document.body).append(host);

  const cell = (cls: string, txt: string, key: string) =>
    `<button class="${cls}${ok(key) ? '' : ' off'}" ${ok(key) ? '' : 'disabled'} data-k="${key}">${txt}</button>`;
  const arrow = (dir: number) => {
    const t = dir < 0 ? new Date(view.y, view.m, 0) : new Date(view.y, view.m + 1, 1); // last day of the previous month / first of the next
    const dis = !ok(iso(t));
    return `<button class="arr${dis ? ' off' : ''} ${dir < 0 ? 'up' : 'down'}" ${dis ? 'disabled' : ''} data-dir="${dir}"><svg viewBox="0 0 24 24"><path d="${
      dir < 0 ? 'M12 21V4M5 11l7-7 7 7' : 'M12 3v17M5 13l7 7 7-7'}"/></svg></button>`;
  };

  const render = () => {
    let body: string;
    if (c.kind === 'month') {
      const mons = Array.from({ length: 12 }, (_, i) => {
        const key = `${view.y}-${pad(i + 1)}`;
        return cell(key === picked ? 'sel' : '', fmt({ month: 'short' }).format(new Date(2026, i, 1)), key);
      }).join('');
      body = `<div class="yr">${view.y}</div><div class="mons">${mons}</div><div class="sb"></div>` +
        `<div class="ft"><span>${L.clear}</span><span>${L.thisMonth}</span></div>`;
    } else {
      const wk = Array.from({ length: 7 }, (_, i) => `<span>${(th ? fmt({ weekday: 'narrow' }).format(new Date(2026, 5, 7 + i)) : fmt({ weekday: 'short' }).format(new Date(2026, 5, 7 + i)).slice(0, 2))}</span>`).join('');
      const first = new Date(view.y, view.m, 1 - new Date(view.y, view.m, 1).getDay());
      const days = Array.from({ length: 42 }, (_, i) => {
        const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
        return cell(iso(d) === picked ? 'sel' : d.getMonth() !== view.m ? 'oth' : '', String(d.getDate()), iso(d));
      }).join('');
      body = `<div class="hd">${fmt({ month: 'long', year: 'numeric' }).format(new Date(view.y, view.m, 1))} ▾</div>` +
        arrow(-1) + arrow(1) + `<div class="wk">${wk}</div><div class="days">${days}</div>` +
        `<div class="ft"><span>${L.clear}</span><span>${L.today}</span></div>`;
    }
    root.innerHTML = `<div class="pop ${c.kind}">${body}</div>`;
    root.querySelectorAll<HTMLElement>('[data-dir]').forEach((a) =>
      a.addEventListener('click', () => { const t = new Date(view.y, view.m + Number(a.dataset.dir), 1); view.y = t.getFullYear(); view.m = t.getMonth(); render(); }));
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((b) =>
      b.addEventListener('click', () => { picked = b.dataset.k!; render(); }));
    // Below the field, flipped above when it would run off the bottom, clamped sideways.
    const r = el.getBoundingClientRect();
    const pop = root.querySelector<HTMLElement>('.pop')!;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.max(0, Math.min(r.left, innerWidth - w))}px`;
    pop.style.top = `${r.bottom + h > innerHeight ? Math.max(0, r.top - h) : r.bottom}px`;
  };
  (host as unknown as { __go: (y: number, m: number) => void }).__go = (y, m) => { view.y = y; view.m = m; render(); };
  render();
  return { y: view.y, m: view.m };
}

async function run(page: Page, input: Locator, kind: 'date' | 'month', value: string, opts: PickerOptions) {
  const fn = kind === 'date' ? 'pickDate' : 'pickMonth';
  const shape = kind === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/;
  const [ty, tm, td = 1] = value.split('-').map(Number);
  const d = new Date(ty, tm - 1, td); // round-trip: Date.parse would accept 2026-02-30
  if (!shape.test(value) || d.getMonth() !== tm - 1 || d.getDate() !== td) {
    throw new Error(`${fn}: "${value}" is not ${kind === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM'}`);
  }
  const { min, max, type } = await input.evaluate((el: HTMLInputElement) => ({ min: el.min, max: el.max, type: el.type }));
  if (type !== kind) throw new Error(`${fn}: the field is type="${type}", not type="${kind}"`);
  if ((min && value < min.slice(0, value.length)) || (max && value > max.slice(0, value.length))) {
    throw new Error(`${fn}: ${value} is outside min=${min || '-'} max=${max || '-'}`);
  }
  // Log the field as a click (sound + ring) without clicking it: a real click opens the real popup in headed runs.
  const box = await pointAt(page, input);
  clickLog.push({ t: Date.now(), ...(box && { box }) });
  const start = await input.evaluate(mount, { kind, locale: opts.locale, labels: opts.labels, host: HOST, css: CSS });
  // The popup lives in the field's frame; Playwright's CSS engine pierces the open shadow root.
  const frame = await (await input.elementHandle())!.ownerFrame();
  const pop = frame!.locator(HOST);
  try {
    if (kind === 'date') {
      const diff = ty * 12 + tm - 1 - (start.y * 12 + start.m);
      if (Math.abs(diff) > 12) await pop.evaluate((h, a) => (h as unknown as { __go: (y: number, m: number) => void }).__go(a[0], a[1]), [ty, tm - 1]);
      else for (let i = 0; i < Math.abs(diff); i++) await tap(page, pop.locator(`[data-dir="${Math.sign(diff)}"]`));
    } else if (ty !== start.y) {
      // The month picker has no arrows: just re-render on the target year.
      await pop.evaluate((h, y) => (h as unknown as { __go: (y: number, m: number) => void }).__go(y, 0), ty);
    }
    await tap(page, pop.locator(`[data-k="${value}"]`));
    if (!REHEARSE) await page.waitForTimeout(250); // let the viewer see the blue selection
  } finally {
    await pop.evaluate((h) => h.remove()).catch(() => {});
  }
  await input.fill(value);
}

export const pickMonth = (page: Page, input: Locator, value: string, opts: PickerOptions = {}) => run(page, input, 'month', value, opts);
export const pickDate = (page: Page, input: Locator, value: string, opts: PickerOptions = {}) => run(page, input, 'date', value, opts);
