import { statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { REHEARSE, tap } from './cursor';

/**
 * Chrome's file panel (<input type=file>) is a separate OS window, so Playwright's
 * video never shows it — the file just appears. pickFiles() lets Playwright's
 * filechooser listener suppress the native panel, draws a look-alike of the macOS
 * "Open" panel in the page, taps through it with the recorder's cursor, then hands
 * the files to the real chooser so the upload is still real.
 * The panel lists ONLY the files passed in — the disk is never read, so nothing
 * of the user's folders can end up in a published video.
 */
export type FileDialogLabel = 'cancel' | 'open' | 'search' | 'name' | 'size' | 'kind' | 'dateAdded' | 'favorites' | 'locations';
export type FileDialogOptions = { os?: 'macos'; locale?: string; folder?: string; labels?: Partial<Record<FileDialogLabel, string>> };

const HOST = '#tvideo-filedialog';

// Sizes/colours measured from Chrome's macOS Open panel at 880x448 CSS px.
const CSS = `
*{box-sizing:border-box}
.panel{position:fixed;left:0;top:0;width:880px;height:448px;transform-origin:0 0;background:#fff;overflow:hidden;
  border-radius:0 0 10px 10px;box-shadow:0 10px 32px rgba(0,0,0,.35),0 0 0 .5px rgba(0,0,0,.3);
  font:13px/1 system-ui,-apple-system,'Thonburi','Sarabun',sans-serif;color:#262626;user-select:none}
.panel>*{position:absolute}
svg{display:block;fill:none;stroke:#555;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
button{all:unset;box-sizing:border-box;cursor:default}
.sb{left:0;top:0;width:168px;height:448px;background:#ececec;padding:10px 10px 0}
.sb h6{margin:0;height:44px;padding:23px 0 0 6px;font-size:12px;font-weight:700;line-height:1;color:#8e8e8e}
.si{display:flex;align-items:center;gap:8px;height:32px;padding:0 6px;border-radius:6px;font-size:13px;white-space:nowrap}
.si svg{width:20px;height:20px;stroke:#1f6bea;stroke-width:1.5;flex:none}
.si.on{background:#d8d8d8}
.pill{top:20px;height:25px;border-radius:6px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;color:#5a5a5a}
.pill svg{width:16px;height:16px;stroke:#444;stroke-width:1.6}
.pill .gap{width:1px;height:15px;background:#cfcfcf}
.pill svg.dim{stroke:#b4b4b4}
.fold{left:409px;top:20px;width:230px;height:25px;border-radius:6px;background:#ebebeb;padding:0 8px;display:flex;align-items:center;gap:5px;font-size:14px}
.fold span{flex:1;white-space:nowrap}.fold svg{width:15px;height:15px;stroke:#555;stroke-width:1.6}
.srch{left:666px;top:20px;width:195px;height:25px;border:1px solid #d6d6d6;border-radius:7px;padding:0 6px;display:flex;align-items:center;gap:5px;color:#8a8a8a;font-size:14px}
.srch svg{width:14px;height:14px;stroke:#777;stroke-width:1.6}
.hd{left:168px;top:64px;width:712px;height:29px;border-top:1px solid #dcdcdc;border-bottom:1px solid #dcdcdc;color:#6b6b6b;font-size:12px;font-weight:500}
.hd>*{position:absolute;top:0;height:27px;line-height:27px;white-space:nowrap}
.hd i{top:6px;width:1px;height:15px;background:#d8d8d8}
.rows{left:178px;top:97px;width:676px;height:285px;overflow:hidden}
.row{position:relative;height:23px;border-radius:5px;font-size:14px;line-height:23px;white-space:nowrap;color:#262626}
.row:nth-child(even){background:#f4f4f4}
.row>*{position:absolute;top:0}
.row .ic{left:16px;top:3px;width:18px;height:17px}
.row .nm{left:37px;width:200px;overflow:hidden;text-overflow:ellipsis}
.row .sz{left:247px;width:120px;text-align:right;color:#777}
.row .kd{left:381px;width:110px;overflow:hidden;color:#777}
.row .dt{left:496px;color:#777}
.row.sel{background:#0b5fd8;color:#fff}.row.sel>:not(.ic){color:#fff}
.sep{left:168px;top:382px;width:712px;height:1px;background:#dcdcdc}
.btn{top:404px;width:78px;height:24px;border-radius:6px;background:#ebebeb;text-align:center;line-height:24px;font-size:14px;color:#262626}
.cancel{left:695px}.open{left:782px;color:#b4b4b4;background:#efefef}
.open.ready{background:#0b6cff;color:#fff}`;


type Item = { name: string; size: number; ext: string };
type Mount = { host: string; css: string; files: Item[]; locale?: string; folder?: string; labels: FileDialogOptions['labels'] };

/** Build the panel next to `el`'s page chrome. Runs in the page; returns nothing, everything is tappable. */
function mount(el: HTMLElement, c: Mount) {
  const loc = c.locale || navigator.language;
  const th = loc.startsWith('th');
  const t = (en: string, thai: string) => (th ? thai : en);
  const L = {
    cancel: t('Cancel', 'ยกเลิก'), open: t('Open', 'เปิด'), search: t('Search', 'ค้นหา'), name: t('Name', 'ชื่อ'),
    size: t('Size', 'ขนาด'), kind: t('Kind', 'ชนิด'), dateAdded: t('Date Added', 'วันที่เพิ่ม'),
    favorites: t('Favorites', 'รายการโปรด'), locations: t('Locations', 'ตำแหน่ง'), ...c.labels,
  };
  const esc = (s: string) => s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);
  const kinds: Record<string, [string, string]> = {
    pdf: ['PDF document', 'เอกสาร PDF'], png: ['PNG image', 'ภาพ PNG'], jpg: ['JPEG image', 'ภาพ JPEG'], jpeg: ['JPEG image', 'ภาพ JPEG'],
    gif: ['GIF image', 'ภาพ GIF'], txt: ['Plain Text', 'ข้อความธรรมดา'], csv: ['CSV text', 'ข้อความ CSV'],
    xlsx: ['Excel spreadsheet', 'สเปรดชีต Excel'], docx: ['Word document', 'เอกสาร Word'], zip: ['ZIP archive', 'ไฟล์เก็บถาวร ZIP'],
  };
  // Finder counts in thousands: "24 KB", "1.2 MB".
  const fmtSize = (n: number) => n < 1000 ? `${n} ${t('bytes', 'ไบต์')}` : n < 1e6 ? `${Math.round(n / 1e3)} KB`
    : n < 1e9 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e9).toFixed(1)} GB`;
  const now = new Date();
  const when = new Intl.DateTimeFormat(loc, { calendar: 'gregory', day: 'numeric', month: 'short', year: 'numeric' }).format(now) + ' ' +
    new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

  document.querySelector(c.host)?.remove(); // a failed earlier pick must not leave a second host
  const host = document.createElement('div');
  host.id = c.host.slice(1);
  // just under the cursor (…647) and its ripple (…646); clickable even when a modal disables the body
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483645;pointer-events:auto';
  const root = host.attachShadow({ mode: 'open' });
  // CSSOM, not a <style> tag: a CSP without 'unsafe-inline' would leave the panel unstyled.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(c.css);
  root.adoptedStyleSheets = [sheet];
  // Inside the field's modal: a <dialog> top layer or a modal's click-outside would block or close it.
  (el.closest('dialog,[role=dialog],[role=alertdialog],[aria-modal=true]') ?? document.body).append(host);

  const svg = (d: string) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const I = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    app: svg('<path d="M12 3l2 5M12 3l-7 17M12 3l7 17M7 15h10"/>'),
    desk: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M3 14h18M8 20h8"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
    down: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v9M8 12l4 4 4-4"/>'),
    cloud: svg('<path d="M7 18a4 4 0 010-8 5 5 0 019.5-1A4.5 4.5 0 0117 18z"/>'),
    hd: svg('<rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h2M10 14h2"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'), fwd: svg('<path d="M9 5l7 7-7 7"/>'),
    list: svg('<path d="M4 7h1M4 12h1M4 17h1M9 7h11M9 12h11M9 17h11"/>'), grid: svg('<path d="M4 5h4v4H4zM10 5h4v4h-4zM16 5h4v4h-4zM4 11h4v4H4zM10 11h4v4h-4zM16 11h4v4h-4z"/>'),
    chev: svg('<path d="M7 10l5 5 5-5"/>'), updown: svg('<path d="M8 10l4-4 4 4M8 14l4 4 4-4"/>'), mag: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>'),
  };
  const folder = `<svg class="ic" viewBox="0 0 18 17" style="fill:#a58be6;stroke:none"><path d="M1 3a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2z" fill="#8f73dd"/><path d="M1 6h16v8a2 2 0 01-2 2H3a2 2 0 01-2-2z"/></svg>`;
  const file = `<svg class="ic" viewBox="0 0 18 17" style="fill:#a58be6;stroke:none"><path d="M4 0h7l4 4v13H4z"/><path d="M11 0v4h4z" fill="#8f73dd"/></svg>`;
  const si = (ic: string, txt: string, on = false) => `<div class="si${on ? ' on' : ''}">${ic}${esc(txt)}</div>`;
  const place = c.folder ?? t('Documents', 'เอกสาร');

  const rows = c.files.map((f, i) => {
    const k = kinds[f.ext];
    return `<button class="row" data-i="${i}" style="display:block;width:676px">${file}<span class="nm">${esc(f.name)}</span>` +
      `<span class="sz">${fmtSize(f.size)}</span><span class="kd">${esc(k ? t(...k) : t('Document', 'เอกสาร'))}</span><span class="dt">${when}</span></button>`;
  }).join('');
  root.innerHTML = `<div class="panel">
<div class="sb">${si(I.clock, t('Recents', 'ล่าสุด'))}<h6>${esc(L.favorites)}</h6>${si(I.desk, t('Desktop', 'เดสก์ท็อป'))}${si(I.doc, t('Documents', 'เอกสาร'), true)}${si(I.down, t('Downloads', 'รายการดาวน์โหลด'))}
<h6>${esc(L.locations)}</h6>${si(I.cloud, 'iCloud Drive')}${si(I.hd, 'Macintosh HD')}</div>
<div class="pill" style="left:188px;width:48px">${I.back.replace('<svg', '<svg class="dim"')}<span class="gap"></span>${I.fwd.replace('<svg', '<svg class="dim"')}</div>
<div class="pill" style="left:244px;width:65px;gap:14px">${I.list}${I.chev}</div>
<div class="pill" style="left:317px;width:65px;gap:14px">${I.grid}${I.chev}</div>
<div class="fold">${folder.replace('class="ic"', '')}<span>${esc(place)}</span>${I.updown}</div>
<div class="srch">${I.mag}${esc(L.search)}</div>
<div class="hd"><span style="left:45px">${esc(L.name)}</span><span style="left:262px;width:12px">${I.chev.replace('<svg', '<svg style="width:12px;height:27px"')}</span><i style="left:276px"></i>
<span style="left:281px">${esc(L.size)}</span><i style="left:373px"></i><span style="left:378px">${esc(L.kind)}</span><i style="left:488px"></i><span style="left:493px">${esc(L.dateAdded)}</span></div>
<div class="rows">${rows}</div><div class="sep"></div>
<button class="btn cancel">${esc(L.cancel)}</button><button class="btn open">${esc(L.open)}</button></div>`;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  root.querySelectorAll<HTMLElement>('.row').forEach((r) => r.addEventListener('click', () => {
    r.classList.add('sel');
    root.querySelector('.open')!.classList.add('ready');
  }));
  // Drops from the top of the content area like a sheet; shrinks to fit a small viewport.
  const s = Math.min(1, (innerWidth - 16) / 880, (innerHeight - 8) / 448);
  // A transformed modal makes position:fixed relative to itself, so subtract where the host really sits.
  const o = host.getBoundingClientRect();
  panel.style.transform = `scale(${s})`;
  panel.style.left = `${(innerWidth - 880 * s) / 2 - o.left}px`;
  panel.style.top = `${-o.top}px`;
}

export async function pickFiles(page: Page, trigger: Locator, files: string | string[], opts: FileDialogOptions = {}): Promise<void> {
  const os = opts.os ?? 'macos';
  if (os !== 'macos') throw new Error(`pickFiles: os "${os}" is not supported yet (macos)`);
  const paths = Array.isArray(files) ? files : [files];
  if (!paths.length) throw new Error('pickFiles: no files given');
  const items: Item[] = paths.map((p) => {
    let st;
    try { st = statSync(p); } catch { throw new Error(`pickFiles: "${p}" does not exist`); }
    if (!st.isFile()) throw new Error(`pickFiles: "${p}" is not a file`);
    return { name: basename(p), size: st.size, ext: extname(p).slice(1).toLowerCase() };
  });

  // Listening before the click makes Playwright suppress the native panel.
  const chooser = page.waitForEvent('filechooser');
  chooser.catch(() => {});
  await tap(page, trigger);
  const fc = await chooser;
  if (items.length > 1 && !fc.isMultiple()) throw new Error('pickFiles: the input is not "multiple" but more than one file was given');

  await trigger.evaluate(mount, { host: HOST, css: CSS, files: items, locale: opts.locale, folder: opts.folder, labels: opts.labels });
  // The panel lives in the trigger's frame; Playwright's CSS engine pierces the open shadow root.
  const handle = (await trigger.elementHandle())!;
  const frame = await handle.ownerFrame();
  await handle.dispose();
  const pop = frame!.locator(HOST);
  try {
    for (let i = 0; i < items.length; i++) await tap(page, pop.locator(`[data-i="${i}"]`));
    if (!REHEARSE) await page.waitForTimeout(400); // let the viewer see the selection and the blue Open
    await tap(page, pop.locator('.open'));
  } finally {
    await pop.evaluate((h) => h.remove()).catch(() => {});
  }
  await fc.setFiles(paths);
}
