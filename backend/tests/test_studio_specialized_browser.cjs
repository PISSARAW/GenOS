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

async function perception(page, root) {
  await page.locator('[data-target="organism-view"]').click();
  await page.getByRole('button', { name: 'Perception et cognition', exact: true }).click();
  const initial = await action(page, { id: 'perception-inspect', route: root + '/perception', method: 'GET' });
  assert.equal(initial.receipts.length, 0);
  const plan = await action(page, { id: 'perception-plan', route: root + '/perception/plan' });
  assert.equal(plan.planningOnly, true);
  const probe = await action(page, { id: 'perception-probe', route: root + '/perception/probe', fields: { path: 'a/verify.cjs' } });
  assert.equal(probe.informationGain, null);
  assert.match(await page.locator('#perception-result-summary').textContent(), /workspace_observed/);
  return { analysisId: probe.analysisId, version: probe.version, planId: plan.analysisId };
}

async function biomimetic(page, root) {
  await page.locator('[data-target="organism-view"]').click();
  await page.getByRole('button', { name: 'Créativité et biophysique', exact: true }).click();
  const creative = await action(page, { id: 'biomimetic-creative', route: root + '/biomimetic/creative' });
  assert.ok(creative.learningProgress > 0);
  assert.equal(creative.creativeEffectMeasured, false);
  const physics = await action(page, { id: 'biomimetic-physics', route: root + '/biomimetic/physics' });
  assert.equal(physics.isNmdaSpike, false);
  assert.match(await page.locator('#biomimetic-result-summary').textContent(), /Appliqué au runtimeNon/);
  return { creativeId: creative.analysisId, physicsId: physics.analysisId, attenuatedVoltage: physics.attenuatedVoltage };
}

async function health(page, context) {
  const { spec, root } = context;
  await page.locator('[data-target="recovery-view"]').click();
  await page.getByRole('button', { name: 'Immunité et nosologie', exact: true }).click();
  const initial = await action(page, { id: 'health-inspect', route: root + '/health', method: 'GET' });
  assert.equal(initial.clinicalState, null);
  const refusal = await action(page, { id: 'health-scan', route: root + '/health/scan', status: 409 });
  assert.equal(refusal.error.code, 'CLINICAL_STATE_UNOBSERVED');
  await require('./helpers/studioClinicalFixture.cjs').seedClinical(spec);
  const scan = await action(page, { id: 'health-scan', route: root + '/health/scan' });
  assert.ok(scan.detections.some(item => item.pathologyType === 'mutation_drift'));
  const biopsy = await action(page, { id: 'health-biopsy', route: root + '/health/biopsy' });
  const diagnosis = await action(page, { id: 'health-diagnose', route: root + '/health/diagnose' });
  assert.equal(diagnosis.confirmed, true);
  assert.match(await page.locator('#health-result-summary').textContent(), /Causalité établieNon/);
  return { scanId: scan.analysisId, biopsyRef: biopsy.biopsyRef, diagnosisId: diagnosis.analysisId };
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
    result.perception = await perception(page, root);
    await page.screenshot({ path: path.join(output, 'studio-perception.png'), fullPage: true });
    result.biomimetic = await biomimetic(page, root);
    await page.screenshot({ path: path.join(output, 'studio-biomimetic.png'), fullPage: true });
    result.health = await health(page, { spec, root });
    await page.screenshot({ path: path.join(output, 'studio-health.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'studio-specialized-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('[data-view]:visible').count(), 0);
    assert.equal(await page.locator('#collective-result').textContent(), '');
    assert.equal(await page.locator('#perception-result').textContent(), '');
    assert.equal(await page.locator('#biomimetic-result').textContent(), '');
    assert.equal(await page.locator('#health-result').textContent(), '');
    assert.deepEqual(errors, []);
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '../..'), encoding: 'utf8', windowsHide: true }).trim();
    fs.writeFileSync(path.join(output, 'studio-specialized-qualified.json'), JSON.stringify({ ...result,
      revision, sourceHashes: fingerprints(), qualifiedAt: new Date().toISOString(), apiInterception: false, errors }, null, 2));
    console.log('Studio specialized browser: real APIs and sourced analyses passed.');
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
