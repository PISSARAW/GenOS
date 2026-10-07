'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { action } = require('./helpers/studioGenosBrowserJourney.cjs');
const { digest } = require('../src/services/studioProductionStore');
const output = path.join(__dirname, '../../.genos-tests/studio-production-f');

function sources() {
  const files = fs.readdirSync(path.join(__dirname, '../../integrations/studio')).filter(file => /\.(mjs|js|css|html)$/.test(file))
    .map(file => 'integrations/studio/' + file);
  files.push(...fs.readdirSync(path.join(__dirname, '../src/services')).filter(file => /^studioProduction.*\.js$/.test(file))
    .map(file => 'backend/src/services/' + file), 'backend/src/routes/studioProductionRoutes.js',
    'backend/src/services/jobWorkerWorkflow.js', 'backend/tests/test_studio_production_browser.cjs',
    'backend/tests/helpers/studioProductionFixture.cjs', 'backend/tests/helpers/studioGenosFixture.cjs',
    'backend/tests/helpers/studioGenosBrowserJourney.cjs', 'backend/tests/helpers/studioProductionBrowserJourney.cjs',
    'backend/src/services/decisionEvidenceService.js', 'backend/src/services/jobWorkerOrchestrator.js',
    'backend/src/services/jobWorkerClaim.js', 'backend/src/services/jobWorkerRetry.js',
    'backend/src/routes/studioGenosRoutes.js', 'backend/src/middleware/tenant.js', 'backend/src/middleware/auth.js',
    'backend/src/controllers/validation/graphValidation.js', 'backend/src/services/studioSpecialistInput.js');
  return Object.fromEntries(files.map(file => [file, digest(fs.readFileSync(path.join(__dirname, '../..', file)))]));
}

async function journey(page, spec) {
  const frozen = await action(page, { id: 'production-freeze', route: '/api/studio/production/releases',
    fields: { workflowId: 'studio-app', version: '1' } });
  const inspected = await action(page, { id: 'production-inspect', route: '/api/studio/production/releases/' + frozen.releaseId, method: 'GET' });
  assert.equal(inspected.integrityChecked, true);
  assert.equal(inspected.deploymentObserved, false);
  assert.match(await page.locator('#production-result-summary').textContent(), /Version servie observéeNon/);
  const served = await require('./helpers/studioProductionBrowserJourney.cjs').deployment(page, { spec, frozen });
  return { releaseId: frozen.releaseId, releaseHash: frozen.releaseHash, served };
}

async function probe(spec) {
  await require('./helpers/studioProductionFixture.cjs').seed(spec);
  const browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(spec.url + '/studio/');
    for (const id of ['organization', 'project', 'agent']) await page.locator('#' + id).fill(spec.settings[id]);
    await page.locator('#token').fill(spec.token);
    await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
    await page.locator('#run-status').filter({ hasText: 'awaiting_approval' }).waitFor();
    await page.locator('[data-target="production-view"]').click();
    assert.equal(await page.locator('#production-view h2').evaluate(element => document.activeElement === element), true);
    const result = await journey(page, spec);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'studio-production.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const unnamed = await page.locator('#production-view input, #production-view textarea').evaluateAll(elements =>
      elements.filter(element => !element.labels?.length).map(element => element.name));
    assert.deepEqual(unnamed, []);
    await page.screenshot({ path: path.join(output, 'studio-production-mobile.png'), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.keyboard.press('Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('[data-view]:visible').count(), 0);
    assert.equal(await page.locator('#production-result').textContent(), '');
    assert.deepEqual(errors, []);
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
    fs.writeFileSync(path.join(output, 'studio-production-qualified.json'), JSON.stringify({ ...result, revision,
      qualifiedAt: new Date().toISOString(), sourceHashes: sources(), apiInterception: false, errors,
      accessibility: { mobile390: true, text200: true, labels: true, keyboard: true, titleFocus: true } }, null, 2));
    console.log('Studio production browser: real freeze, staging execution, review, production invocation, rollback, observation and feedback passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'studio-production-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
