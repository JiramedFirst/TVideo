# Recording reference

## Environment variables (recorder)

| Var | Meaning |
|---|---|
| `TV_BASE_URL` | App root, trailing path kept (`https://staging.example.com/app/`). Specs use **relative** paths (`orders/new`). |
| `TV_LOCALE` | Browser locale → UI language (`th-TH`, `en-US`). Some apps read a cookie instead — set it in the spec with `context.addCookies`. |
| `TV_TIMEZONE` | e.g. `Asia/Bangkok`, so dates on screen match the audience. |
| `TV_USERNAME` / `TV_PASSWORD` | Demo account. `auth.setup.ts` logs in once (not filmed) and saves `.auth/state.json`. |
| `TV_LOGIN_PATH`, `TV_USER_SELECTOR`, `TV_PASS_SELECTOR`, `TV_SUBMIT_SELECTOR` | Override when the login form isn't standard. |
| `TV_REHEARSE=1` | Dry run: no video, no glides/pauses. |

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
| Page "teleports" to a lower section | Playwright auto-scrolls instantly before acting | `await glideTo(page, target)` before acting on anything below the fold |
| Native `<select>` options never appear | The option list is an OS popup; the page video can't capture it | `pointAt(page, select)` then `selectOption()` — viewer sees the value change; or caption it |
| Date that worked yesterday is disabled today | Booking/scheduling windows are enforced against the real clock | Use `relativeDay(offset, timeZone)` — never hardcode demo dates |
| Business rule rejects the action (break time, capacity, cut-off) | Real config is stricter than test data | Read the on-screen error, pick a valid value dynamically (e.g. first enabled slot), don't fake the rule |
| Login needs OTP / 2FA | Code arrives out of band | Poll a file in the spec (`otp.txt`) and ask the user to paste the code there during the run; or keep login out of the clip via `auth.setup.ts` |
| Framework dev badge in every frame | Dev servers inject overlays | `createTimeline` hides Next.js/Vite overlays; record against a built/staging app when possible |
| Demo data looks fake ("test", "QA", "mock-id") | Seeds/test fixtures | Use realistic fictional data in the demo account; mask what you can't change |

## Copy recordings out immediately

`test-results/` is wiped at the start of every Playwright run (and per config if
two configs share an `outputDir`). After each successful take run
`scripts/import.sh` (or copy the folder elsewhere) before recording the next clip.

## Chaining clips without database access

If clip B needs data clip A creates (e.g. "cancel a booking" needs a booking),
write what A created (id/number read from the success screen) to a small JSON
file in A, read it in B, and name files so they run in order (`02-create`,
`03-…`). Do the destructive clip (cancel/delete) last.
