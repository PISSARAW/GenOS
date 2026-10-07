'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const journeys = require('./helpers/studioGenosBrowserJourney.cjs');

function sourceHashes() {
  const files = fs.readdirSync(path.join(__dirname, '../../integrations/studio')).filter(file => /\.(mjs|js|css|html)$/.test(file))
    .map(file => 'integrations/studio/' + file);
  files.push('backend/src/routes/studioGenosRoutes.js', ...['Worlds', 'Memory', 'Genome', 'Recovery'].map(name => 'backend/src/services/studio' + name + 'Service.js'),
    'backend/tests/test_studio_genos_browser.cjs', 'backend/tests/helpers/studioGenosBrowserJourney.cjs', 'backend/tests/helpers/studioGenosFixture.cjs');
  return Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../..', file))).digest('hex')]));
}

async function checkView(page, view) {
  await page.locator(`[data-target="${view}-view"]`).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, view);
  assert.equal(await page.locator(`#${view}-view h2`).evaluate(element => document.activeElement === element), true);
  const unnamed = await page.locator('input:visible,select:visible,textarea:visible').evaluateAll(elements =>
    elements.filter(element => !element.labels?.length && !element.getAttribute('aria-label')).map(element => element.name));
  assert.deepEqual(unnamed, [], view);
}

async function probe(spec) {
  await require('./helpers/studioGenosFixture.cjs').seedGenome(spec);
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
    result.knowledge = await journeys.knowledge(page, spec);
    await page.screenshot({ path: path.join(output, 'studio-memory.png'), fullPage: true });
    result.organism = await journeys.organism(page);
    await page.screenshot({ path: path.join(output, 'studio-organism.png'), fullPage: true });
    result.recovery = await journeys.recovery(page, { spec, worlds: result.worlds });
    await page.locator('[data-target="recovery-view"]').click();
    await page.screenshot({ path: path.join(output, 'studio-recovery.png'), fullPage: true });
    await page.locator('[data-target="worlds-view"]').click();
    await page.screenshot({ path: path.join(output, 'studio-worlds.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ['worlds', 'knowledge', 'organism', 'recovery']) {
      await checkView(page, view);
    }
    await page.screenshot({ path: path.join(output, 'studio-genos-mobile.png'), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const view of ['worlds', 'knowledge', 'organism', 'recovery']) await checkView(page, view);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.keyboard.press('Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('#worlds-result').textContent(), '');
    assert.equal(await page.locator('#knowledge-result').textContent(), '');
    assert.equal(await page.locator('#organism-result').textContent(), '');
    assert.equal(await page.locator('#recovery-result').textContent(), '');
    assert.equal(await page.locator('[data-view]:visible').count(), 0);
    assert.equal(await page.locator('[name="rightAgentId"]').inputValue(), '');
    assert.deepEqual(errors, []);
    result.errors = errors;
    result.qualifiedAt = new Date().toISOString();
    result.revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '../..'), encoding: 'utf8', windowsHide: true }).trim();
    result.sourceHashes = sourceHashes();
    result.accessibilityProbes = { mobile390: true, text200Percent: true, labels: true, titleFocus: true, keyboardTab: true };
    result.binarySha256 = crypto.createHash('sha256').update(fs.readFileSync(require('../src/services/genosCliEnv').resolveGenosBin())).digest('hex');
    fs.writeFileSync(path.join(output, 'studio-genos-qualified.json'), JSON.stringify(result, null, 2));
    console.log('Studio GenOS browser journeys passed without intercepted APIs.');
  } catch (error) {
    console.error(await page.locator('#message').textContent(), errors);
    await page.screenshot({ path: path.join(output, 'studio-genos-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
