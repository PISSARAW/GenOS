'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { request } = require('./studioRequest.cjs');

const fileRoute = '/api/workspaces/consumer-ws/file?path=a%2Fverify.cjs';
const candidate = "const assert = require('node:assert/strict');\nassert.equal(2 + 2, 4);\nconsole.log('consumer proof');\n";
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const loaded = page => page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
const runState = (page, status) => page.locator('#run-status').filter({ hasText: status }).waitFor({ timeout: 60000 });

async function login(page, spec) {
  await page.goto(spec.settings.url + '/studio/');
  for (const field of ['organization', 'project', 'agent']) await page.locator('#' + field).fill(spec.settings[field]);
  await page.locator('#token').fill(spec.token);
  await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
  await runState(page, 'awaiting_approval');
  await loaded(page);
  assert.equal(await page.locator('#run-id').textContent(), spec.run.id);
}

async function editAndSnapshot(page, spec) {
  await page.locator('[data-target="files-view"]').click();
  await page.locator('#file-path').fill('a/verify.cjs');
  await page.locator('#file-open').click();
  await page.locator('#file-result').filter({ hasText: 'Version chargée' }).waitFor();
  await loaded(page);
  await page.locator('#file-content').fill(candidate);
  await page.locator('#file-save').click();
  await page.locator('#file-result').filter({ hasText: digest(candidate) }).waitFor();
  await loaded(page);
  assert.equal(fs.readFileSync(spec.file, 'utf8'), candidate);
  const response = page.waitForResponse(value => value.url().endsWith('/snapshots') && value.request().method() === 'POST');
  await page.locator('#editor-snapshot').click();
  const captured = await response;
  assert.equal(captured.status(), 201);
  const snapshot = await captured.json();
  await loaded(page);
  await page.locator('#editor-snapshots').filter({ hasText: snapshot.id }).waitFor();
  return snapshot.id;
}

async function conflictAndRestore(page, spec, snapshotId) {
  const current = await request(spec, fileRoute);
  assert.equal(current.status, 200);
  const concurrent = candidate + '// concurrent writer\n';
  const updated = await request(spec, fileRoute, { method: 'PUT', body: {
    version: current.value.version, contentBase64: Buffer.from(concurrent).toString('base64') } });
  assert.equal(updated.status, 200);
  const draft = candidate + '// unsaved operator draft\n';
  await page.locator('#file-content').fill(draft);
  await page.locator('#file-save').click();
  await page.locator('#message').filter({ hasText: '409' }).waitFor();
  assert.equal(await page.locator('#file-content').inputValue(), draft);
  assert.equal(fs.readFileSync(spec.file, 'utf8'), concurrent);
  await page.locator('#restore-id').fill(snapshotId);
  await page.locator('#restore-preview').click();
  await loaded(page);
  page.once('dialog', dialog => dialog.accept());
  const response = page.waitForResponse(value => value.url().endsWith('/restore') && value.request().method() === 'POST');
  await page.locator('#restore').click();
  const restored = await response;
  assert.equal(restored.status(), 200);
  const result = await restored.json();
  await page.locator('#restore-result-summary').filter({ hasText: 'Snapshot de sécurité' }).waitFor();
  await loaded(page);
  assert.equal(fs.readFileSync(spec.file, 'utf8'), candidate);
  assert.equal(result.restoredSnapshot.id, snapshotId);
  assert.notEqual(result.safetySnapshot.id, snapshotId);
  const stored = await spec.db.get('SELECT snapshot_hash FROM workspace_snapshots WHERE id = ?', result.safetySnapshot.id);
  assert.equal(stored.snapshot_hash, result.safetySnapshot.snapshotHash);
  return result;
}

async function tenantRefusals(spec) {
  const foreign = await request(spec, fileRoute, { project: 'b06-other' });
  const secret = await request(spec, '/api/workspaces/consumer-ws/file?path=.env');
  const traversal = await request(spec, '/api/workspaces/consumer-ws/file?path=..%2Foutside');
  assert.equal(foreign.status, 404);
  assert.equal(secret.status, 403);
  assert.equal(traversal.status, 400);
  return { foreignProject: foreign.status, secret: secret.status, traversal: traversal.status, staleWrite: 409 };
}

async function approve(page, spec) {
  await page.locator('[data-target="inspection"]').click();
  await page.getByText('Soumettre un dossier d’approbation signé').click();
  await page.locator('#approval-json').fill('{}');
  await page.getByRole('button', { name: 'Soumettre l’approbation' }).click();
  await page.locator('#message').filter({ hasText: '403' }).waitFor();
  assert.equal(await page.locator('#approval-json').inputValue(), '{}');
  assert.equal(await page.locator('#inspection').isVisible(), true);
  assert.equal((await spec.db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', spec.run.id)).status, 'awaiting_approval');
  const refused = await request(spec, '/api/product-proofs/consumer-runs/' + spec.run.id);
  assert.equal(refused.status, 200);
  assert.equal(refused.value.provenance.length, 0);
  await page.locator('#refresh').click();
  await runState(page, 'awaiting_approval');
  await loaded(page);
  await page.locator('#approval-json').fill(JSON.stringify(require('./b06ClientFixture.cjs').approval(spec)));
  await page.getByRole('button', { name: 'Soumettre l’approbation' }).click();
  await runState(page, 'completed');
  await loaded(page);
  const inspected = await request(spec, '/api/product-proofs/consumer-runs/' + spec.run.id);
  assert.equal(inspected.status, 200);
  assert.equal(inspected.value.promotion.phase, 'completed');
  const provenance = inspected.value.provenance;
  assert.equal(provenance.length, 1);
  assert.equal(provenance[0].assemblyAccepted, true);
  assert.ok(provenance[0].verifierResultIds.length >= 2);
  assert.equal(provenance[0].memories.length, 1);
  assert.equal(provenance[0].memories[0].integrityChecked, true);
  assert.equal(provenance[0].memories[0].parentHash, provenance[0].hash);
  assert.deepEqual(JSON.parse(await page.locator('#provenance').textContent()), provenance);
  return inspected.value;
}

async function disconnect(page) {
  await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
  assert.equal(await page.locator('#inspection').isVisible(), false);
  assert.equal(await page.locator('#file-content').inputValue(), '');
  assert.equal(await page.locator('#provenance').textContent(), '');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
}

async function run(spec, output) {
  const browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await login(page, spec);
    const snapshotId = await editAndSnapshot(page, spec);
    const restoration = await conflictAndRestore(page, spec, snapshotId);
    await page.screenshot({ path: path.join(output, 'studio-pilot-restored.png'), fullPage: true });
    const refusals = await tenantRefusals(spec);
    const inspection = await approve(page, spec);
    await page.screenshot({ path: path.join(output, 'studio-pilot-promoted.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'studio-pilot-mobile.png'), fullPage: true });
    await disconnect(page);
    assert.deepEqual(errors, []);
    return { browserVersion: browser.version(), snapshotId, restoration, refusals: { ...refusals, unsignedApproval: 403 },
      candidateSha256: digest(candidate), inspection, errors, disconnectPurged: true, mobileNoOverflow: true };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'studio-pilot-failure.png'), fullPage: true });
    console.error('Pilot failure:', await page.locator('#message').textContent(), errors);
    throw error;
  } finally { await browser.close(); }
}

module.exports = { run };
