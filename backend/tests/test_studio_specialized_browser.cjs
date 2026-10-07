'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { action } = require('./helpers/studioGenosBrowserJourney.cjs');

function fingerprints() {
  const files = fs.readdirSync(path.join(__dirname, '../../integrations/studio')).filter(file => /\.(mjs|js|css|html)$/.test(file))
    .map(file => 'integrations/studio/' + file);
  files.push(...fs.readdirSync(path.join(__dirname, '../src/services')).filter(file => /^studio.*\.js$/.test(file)).map(file => 'backend/src/services/' + file),
    'backend/src/routes/studioGenosRoutes.js', 'backend/tests/test_studio_specialized_browser.cjs');
  return Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../..', file))).digest('hex')]));
}

async function collective(page, root) {
  await page.locator('[data-target="organism-view"]').click();
  await page.getByRole('button', { name: 'Topologies et organisations', exact: true }).click();
  const catalog = await action(page, { id: 'collective-inspect', route: root + '/collective', method: 'GET' });
  assert.equal(catalog.organizations.length, 19);
  const result = await action(page, { id: 'collective-step', route: root + '/collective/step' });
  assert.equal(result.step.reached, true);
  assert.match(await page.locator('#collective-result-summary').textContent(), /Appliqué au runtimeNon/);
  return { analysisId: result.analysisId, organization: result.organization };
}

async function probe(spec) {
  const browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const output = path.join(__dirname, '../../.genos-tests/studio-specialized-e');
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(spec.url + '/studio/');
    for (const id of ['organization', 'project', 'agent']) await page.locator('#' + id).fill(spec.settings[id]);
    await page.locator('#token').fill(spec.token);
    await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
    await page.locator('#run-status').filter({ hasText: 'awaiting_approval' }).waitFor();
    const root = '/api/studio/agents/' + spec.settings.agent;
    const result = { collective: await collective(page, root) };
    await page.screenshot({ path: path.join(output, 'studio-collective.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'studio-specialized-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('[data-view]:visible').count(), 0);
    assert.equal(await page.locator('#collective-result').textContent(), '');
    assert.deepEqual(errors, []);
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '../..'), encoding: 'utf8', windowsHide: true }).trim();
    fs.writeFileSync(path.join(output, 'studio-specialized-qualified.json'), JSON.stringify({ ...result,
      revision, sourceHashes: fingerprints(), qualifiedAt: new Date().toISOString(), apiInterception: false, errors }, null, 2));
    console.log('Studio specialized browser: real APIs and sourced analyses passed.');
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
