import { test, expect } from '@playwright/test';
import { clickLog, installCursor, markMoved, tap } from '../cursor';

// #2: a tapped control that is still on the page but somewhere else at the step's end
// (the page scrolled) is marked `moved`, so the editor holds the frame of the tap.
test('markMoved flags taps whose control scrolled away, not ones that stayed or vanished', async ({ context, page }) => {
  await installCursor(context);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`<body style="margin:0;height:3000px">
    <button id="scroll" style="position:absolute;top:100px;left:40px">Scroll</button>
    <button id="stay" style="position:fixed;top:200px;left:40px">Stay</button>
    <button id="gone" style="position:absolute;top:300px;left:40px" onclick="this.remove()">Gone</button>
    <button id="grow" style="position:fixed;top:250px;left:40px" onclick="this.textContent = 'Saving your changes…'">Save</button></body>`);
  const from = clickLog.length;
  await tap(page, page.locator('#scroll'));
  await tap(page, page.locator('#stay'));
  await tap(page, page.locator('#gone'));
  await tap(page, page.locator('#grow'));
  await page.evaluate(() => window.scrollBy(0, 400));
  await markMoved(from);
  const [scrolled, stayed, gone, grew] = clickLog.slice(from);
  expect(scrolled.moved).toBe(true);
  expect(stayed.moved).toBeUndefined();
  expect(gone.moved).toBeUndefined();
  expect(grew.moved).toBeUndefined(); // a label change resized it in place; nothing scrolled
});
