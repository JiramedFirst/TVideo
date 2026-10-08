import { test, expect } from '@playwright/test';
import { tap } from '../cursor';
import { createTimeline, glideTo, hold } from '../timeline';

/**
 * Example clip, runnable as-is with TV_BASE_URL=https://playwright.dev/ — replace
 * with the real flow. The pattern every clip follows:
 *  - createTimeline() is the first line (its t0 is the video's t=0);
 *  - every viewer-visible step is tl.step('<caption the viewer will read>', …);
 *  - every click/type goes through tap()/typeInto() so the cursor glides there
 *    and the click time is logged for the editor's click sound;
 *  - every step ENDS with an expect — the recording is also a test, so when the
 *    app's UI changes a re-record fails loudly instead of filming a broken flow;
 *  - glideTo() before anything below the fold (no jump cuts), hold() after key
 *    moments so the viewer can read the screen.
 */
test('01 example: open the getting-started guide', async ({ page }, testInfo) => {
  const tl = createTimeline(testInfo, page);

  await tl.step('Open the home page', async () => {
    await page.goto('');
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
    await hold(page);
  });

  await tl.step('Click “Get started”', async () => {
    await tap(page, page.getByRole('link', { name: 'Get started' }));
    await expect(page).toHaveURL(/docs\/intro/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await hold(page);
  });

  await tl.step('Scroll down to the installation steps', async () => {
    const install = page.getByRole('heading', { name: /installing playwright/i });
    await glideTo(page, install);
    await expect(install).toBeInViewport();
    await hold(page, 2000);
  });

  await tl.save();
});
