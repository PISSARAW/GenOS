'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

const views = ['inspection', 'dashboard-view', 'management-view', 'files-view', 'research-view'];

async function check(page, view) {
  await page.locator('[data-target="' + view + '"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, view);
  assert.equal(await page.locator('#' + view + ' h2').evaluate(element => document.activeElement === element), true);
  const unnamed = await page.locator('input:visible,select:visible,textarea:visible').evaluateAll(elements =>
    elements.filter(element => !element.labels?.length && !element.getAttribute('aria-label')).map(element => element.id));
  assert.deepEqual(unnamed, [], view);
}

async function run(page, output) {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of views) {
    await check(page, view);
    await page.screenshot({ path: path.join(output, view + '-parity-mobile.png'), fullPage: true });
  }
  await page.locator('#run-id').evaluate(element => { element.textContent = 'hash'.repeat(64); });
  await check(page, 'inspection');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  for (const view of views) await check(page, view);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const view of views) {
    await check(page, view);
    await page.screenshot({ path: path.join(output, view + '-parity-desktop.png'), fullPage: true });
  }
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => document.activeElement?.tagName);
  assert.notEqual(focus, 'BODY');
  return { views: views.length, mobile390: true, desktop1440: true,
    text200Percent: true, labelledControls: true, viewTitleFocus: true };
}

module.exports = { run };
