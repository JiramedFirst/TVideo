# Recording reference

## Environment variables (recorder)

| Var | Meaning |
|---|---|
| `TV_BASE_URL` | App root, trailing path kept (`https://staging.example.com/app/`). Specs use **relative** paths (`orders/new`). |
| `TV_LOCALE` | Browser locale → UI language (`th-TH`, `en-US`). Some apps read a cookie instead — set it in the spec with `context.addCookies`. |
| `TV_TIMEZONE` | e.g. `Asia/Bangkok`, so dates on screen match the audience. |
| `TV_USERNAME` / `TV_PASSWORD` | Demo account. `auth.setup.ts` logs in once (not filmed) and saves `.auth/state.json`. |
| `TV_LOGIN_PATH`, `TV_USER_SELECTOR`, `TV_PASS_SELECTOR`, `TV_SUBMIT_SELECTOR` | Override when the login form isn't standard. |
| `TV_VIEWPORT` | `WIDTHxHEIGHT` of the page and the video (default `1280x800`). Frame coordinates in `plan.json` are in this space. |
| `TV_LOGGED_IN_SELECTOR` | Selector that is visible once signed in. Use when the app keeps a `/login`-like URL after sign-in; default check is "URL no longer contains `login`". |
| `TV_OTP_FILE` | File `waitForOtp()` polls (default `otp.txt`). |
| `TV_REHEARSE=1` | Dry run: no video, no glides/pauses. |
| `TV_RECORDINGS_DIR` | Where takes are saved after a real run (default `recordings`). Relative paths are taken from the config file's folder, not the shell's. |

**Session expiry.** A session saved by hand in `.auth/state.json` is re-checked
before the clips run. If the app bounces to the login page (or
`TV_LOGGED_IN_SELECTOR` isn't visible) the run fails with "Saved session expired".
Delete `.auth/state.json` and log in again, or rerun
`npx playwright codegen --save-storage=.auth/state.json <url>`.

Ask the user to `export` credentials in their own terminal (or a `.env` they keep
out of git). Never echo them, never write them to a file you create.

## Writing a clip spec

```ts
const tl = createTimeline(testInfo, page);            // first line: t0 = video t=0
await tl.step('Click “New order”', async () => {      // label = caption idea
  await tap(page, page.getByRole('button', { name: 'New order' }));
  await expect(page.getByRole('heading', { name: 'New order' })).toBeVisible();
  await hold(page);                                   // let the viewer read
});
await tl.save();                                      // writes timeline.json + clicks.json
```

- **Act at the start of a step, linger at the end.** The editor assumes the click
  happens early in the step and the end of the step is the settled result.
- **One idea per step.** If a caption needs "and", it's two steps.
- **Every step ends with an expect.** The recording doubles as a test: when the UI
  changes, the next re-record fails instead of filming a broken flow.
- **Pick like a user.** Open the dropdown and click the option; open the calendar
  and click the day. Typing a code into a combobox teaches nothing.

## Things that don't film well — and the fix

| Problem | Why | Fix |
|---|---|---|
| Page "teleports" to a lower section | Playwright auto-scrolls instantly before acting | `tap`/`typeInto` smooth-scroll off-screen controls themselves; call `glideTo(page, target)` only before a raw Playwright action (`fill`, `selectOption`) or to show something without clicking it |
| Native `<select>` options never appear | The option list is an OS popup; the page video can't capture it | `pointAt(page, select)` then `selectOption()` — viewer sees the value change; or caption it |
| Date/month picker popup never appears; the date "just appears" | Chrome's `<input type="date">` / `"month"` popup is a separate OS window | `pickDate(page, input, 'YYYY-MM-DD')` / `pickMonth(page, input, 'YYYY-MM')` from `pickers.ts`: draws a Chrome-style popup in the page (flips above a field near the bottom), the cursor taps through it, then the real value is set with `fill()`. The real popup follows the OS language, not `TV_LOCALE` — pass `{ locale: 'th-TH' }` and, if needed, `labels: { clear, today, thisMonth }` |
| File upload: the file "just appears" | The OS file dialog is a separate window | `pickFiles(page, trigger, ['fixtures/invoice.pdf'])` from `file-dialog.ts`: taps the upload control with Playwright's file-chooser listener armed (no native dialog), draws a macOS-style Open panel listing only the files you pass (never your disk), taps them and Open, then `setFiles` does the real upload. Use fictional fixture files (Phase 1 safety). Options: `locale`, `folder` (the name in the folder popup), `labels` |
| Date that worked yesterday is disabled today | Booking/scheduling windows are enforced against the real clock | Use `relativeDay(offset, timeZone)` — never hardcode demo dates |
| Business rule rejects the action (break time, capacity, cut-off) | Real config is stricter than test data | Read the on-screen error, pick a valid value dynamically (e.g. first enabled slot), don't fake the rule |
| Login needs OTP / 2FA | Code arrives out of band | `const code = await waitForOtp()` (from `otp.ts`): clears any stale `otp.txt`, then polls it until it holds a 4-10 character code (spaces/hyphens ignored), returns it and deletes the file. Ask the user to paste the code there during the run (rehearsal too). Call it before the first `tl.step` (or in a step you cut) — the wait is dead air. Or keep login out of the clip via a saved session |
| Framework dev badge in every frame | Dev servers inject overlays | `createTimeline` hides Next.js/Vite overlays; record against a built/staging app when possible |
| Demo data looks fake ("test", "QA", "mock-id") | Seeds/test fixtures | Use realistic fictional data in the demo account, never rows copied from production (see SKILL.md, "Seed and fixture data"); mask what you can't change |

## Takes are kept in `recordings/`

Playwright wipes its output folder (`test-results/`) at the start of every run.
After each non-rehearsal run the recorder's `globalTeardown` copies every clip
folder — any folder in a project's `outputDir` holding the `timeline.json` that
`timeline.ts` writes (with its `video.webm`), during this run — to
`recordings/<YYYYMMDD-HHMMSS>/` next to the config file (or
`$TV_RECORDINGS_DIR/<…>`) and prints the path; import from there. Rehearsals copy
nothing. If two configs share an `outputDir` they still wipe each other, so give
each its own.

## Embed in an existing Playwright project

Use this when the app's own Playwright suite is the only practical way in — its
login comes from repo fixtures (signed cookies, seeded sessions) that
`TV_USERNAME` / `.auth/state.json` can't reproduce. The clips then live inside that
project instead of a standalone `recorder/`.

1. Copy `cursor.ts`, `timeline.ts` and `teardown.ts` (plus `otp.ts` if a clip needs
   it) from `<skill>/templates/recorder/` into a folder of that project, e.g.
   `e2e/tvideo/`. They only need `@playwright/test`.
2. Write the clip specs next to them (`e2e/tvideo/clips/01-….spec.ts`), importing
   `test` from the app's own fixtures file instead of `@playwright/test`, so its
   login fixture signs the page in. Keep the login out of the timeline (before the
   first `tl.step`), and start every clip with a `page.goto(...)` after
   `createTimeline`: the visible cursor and the dev-badge hiding are installed for
   the next navigation, so steps on the page the fixture left open are filmed
   without them.
3. Keep the clips out of the app's own suite: add the folder to the main config's
   `testIgnore` (e.g. `testIgnore: ['**/tvideo/**']`). Otherwise its CI runs every
   clip for real — slow, filmed, and creating real data.
4. Give the clips their own config that **extends** the app's, so its `globalSetup`,
   `webServer`, `baseURL` and top-level `use` (the login fixtures usually need them)
   still apply — but with **one clips project of its own**: a project's `use`,
   `testDir` and `testMatch` override the top level, so an inherited project (e.g.
   `devices['Desktop Chrome']` at 1280×720, or `video: 'retain-on-failure'`) would
   film at the wrong size or not at all. E.g. `playwright.tvideo.config.ts`:

   ```ts
   import { defineConfig } from '@playwright/test';
   import app from './playwright.config';

   const REHEARSE = process.env.TV_REHEARSE === '1';
   const viewport = { width: 1280, height: 800 };
   // The app's project the login fixtures run under (and its setup project, if any).
   const appProject = app.projects?.find((p) => p.name === 'chromium') ?? {};
   const setup = app.projects?.filter((p) => appProject.dependencies?.includes(p.name!)) ?? [];
   export default defineConfig({
     ...app,
     outputDir: './test-results-tvideo',     // its own: two configs sharing one wipe each other
     globalTeardown: './e2e/tvideo/teardown.ts',
     workers: 1, retries: 0, timeout: 240_000,
     projects: [...setup, {
       ...appProject,
       name: 'tvideo',
       testDir: './e2e/tvideo/clips', testMatch: /.*\.spec\.ts/, testIgnore: [],
       use: {
         ...app.use, ...appProject.use,
         viewport,
         locale: process.env.TV_LOCALE ?? appProject.use?.locale ?? app.use?.locale,
         timezoneId: process.env.TV_TIMEZONE ?? appProject.use?.timezoneId ?? app.use?.timezoneId,
         video: REHEARSE ? 'off' : { mode: 'on', size: viewport },
         launchOptions: { ...appProject.use?.launchOptions, slowMo: REHEARSE ? 0 : 250 },
       },
     }],
   });
   ```

   If the app already has a `globalTeardown` (cleanup of seeded data), keep it by
   chaining both and passing the config on — the recorder's teardown needs it:
   `export default async (config) => { await appTeardown(config); await tvideoTeardown(config); }`
   (or `globalTeardown: [app, tvideo]` on Playwright 1.49+).
5. Run `npx playwright test -c playwright.tvideo.config.ts` (with `TV_REHEARSE=1`
   first). Takes land in `recordings/<timestamp>/` next to that config file —
   git-ignore it, it holds screen recordings of the app — or wherever
   `TV_RECORDINGS_DIR` points. Folder names follow the project's spec paths, not
   `clips-…`; that's fine. If the run ends with "not saved, no video.webm", video is
   off for that project: fix the config and record again before the next run wipes it.

## Chaining clips without database access

If clip B needs data clip A creates (e.g. "cancel a booking" needs a booking),
write what A created (id/number read from the success screen) to a small JSON
file in A, read it in B, and name files so they run in order (`02-create`,
`03-…`). Do the destructive clip (cancel/delete) last.
