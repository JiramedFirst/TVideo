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
| `TV_RECORDINGS_DIR` | Where takes are saved after a real run (default `recordings`). |

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
| Date that worked yesterday is disabled today | Booking/scheduling windows are enforced against the real clock | Use `relativeDay(offset, timeZone)` — never hardcode demo dates |
| Business rule rejects the action (break time, capacity, cut-off) | Real config is stricter than test data | Read the on-screen error, pick a valid value dynamically (e.g. first enabled slot), don't fake the rule |
| Login needs OTP / 2FA | Code arrives out of band | `const code = await waitForOtp()` (from `otp.ts`): clears any stale `otp.txt`, then polls it until it holds a 4-10 character code (spaces/hyphens ignored), returns it and deletes the file. Ask the user to paste the code there during the run (rehearsal too). Call it before the first `tl.step` (or in a step you cut) — the wait is dead air. Or keep login out of the clip via a saved session |
| Framework dev badge in every frame | Dev servers inject overlays | `createTimeline` hides Next.js/Vite overlays; record against a built/staging app when possible |
| Demo data looks fake ("test", "QA", "mock-id") | Seeds/test fixtures | Use realistic fictional data in the demo account, never rows copied from production (see SKILL.md, "Seed and fixture data"); mask what you can't change |

## Takes are kept in `recordings/`

Playwright wipes its output folder (`test-results/`) at the start of every run.
After each non-rehearsal run the recorder's `globalTeardown` copies every clip
folder — any folder in a project's `outputDir` holding the `timeline.json` that
`timeline.ts` writes — to `recordings/<YYYYMMDD-HHMMSS>/` (or
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
   first `tl.step`).
3. Give the clips their own config, so the app's suite keeps its settings and
   output — e.g. `playwright.tvideo.config.ts` beside the project's config. Copy
   from the template's `playwright.config.ts`: `video: { mode: 'on', size: viewport }`
   with the same `viewport`, `launchOptions: { slowMo: 250 }` (0 when
   `TV_REHEARSE=1`, with video off), `workers: 1`, `retries: 0`, a long `timeout`,
   `globalTeardown` pointing at the copied `teardown.ts`, and an `outputDir` of its
   own (e.g. `./test-results-tvideo`). Set `testDir` to the clips folder and keep
   the app's `baseURL` and any `use` options its fixtures need.
4. Run `npx playwright test -c playwright.tvideo.config.ts` (with `TV_REHEARSE=1`
   first). Takes land in `recordings/<timestamp>/` of the folder you run from — set
   `TV_RECORDINGS_DIR` to put them elsewhere (and git-ignore that folder).
   Folder names follow the project's spec paths, not `clips-…`; that's fine.

## Chaining clips without database access

If clip B needs data clip A creates (e.g. "cancel a booking" needs a booking),
write what A created (id/number read from the success screen) to a small JSON
file in A, read it in B, and name files so they run in order (`02-create`,
`03-…`). Do the destructive clip (cancel/delete) last.
