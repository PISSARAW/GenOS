'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const journeys = require('./helpers/studioGenosBrowserJourney.cjs');

async function probe(spec) {
  const browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const output = process.env.GENOS_STUDIO_TEST_ARTIFACTS || path.join(__dirname, '../../.genos-tests/studio-genos-d');
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(spec.url + '/studio/');
    for (const id of ['organization', 'project', 'agent']) await page.locator('#' + id).fill(spec.settings[id]);
    await page.locator('#token').fill(spec.token);
    await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
    await page.locator('#run-status').filter({ hasText: 'awaiting_approval' }).waitFor();
    const result = { apiInterception: false, browserVersion: browser.version(), worlds: await journeys.worlds(page) };
    await page.locator('[data-target="worlds-view"]').click();
    await page.screenshot({ path: path.join(output, 'studio-worlds.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'studio-genos-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('#worlds-result').textContent(), '');
    assert.equal(await page.locator('[name="rightAgentId"]').inputValue(), '');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'studio-genos-qualified.json'), JSON.stringify(result, null, 2));
    console.log('Studio GenOS browser journeys passed without intercepted APIs.');
  } catch (error) {
    console.error(await page.locator('#message').textContent(), errors);
    await page.screenshot({ path: path.join(output, 'studio-genos-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
