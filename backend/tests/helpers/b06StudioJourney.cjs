'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

async function login(page, spec, project) {
  await page.locator('#token').fill(spec.token);
  await page.locator('#organization').fill(spec.settings.organization);
  await page.locator('#project').fill(project);
  await page.locator('#agent').fill(spec.settings.agent);
  await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
}

async function waitState(page, text) {
  await page.locator('#run-status').filter({ hasText: text }).waitFor({ state: 'visible', timeout: 30000 });
}

async function negativeUiCases(page, spec) {
  const latest = '**/api/product-proofs/consumer-agents/*/latest';
  await page.route(latest, route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }) }));
  await login(page, spec, spec.settings.project);
  await page.locator('#message').filter({ hasText: 'Session expirée' }).waitFor();
  assert.equal(await page.locator('#inspection').isVisible(), false);
  await page.unroute(latest);

  await page.route(latest, route => route.fulfill({ status: 502, contentType: 'text/plain', body: 'upstream unavailable' }));
  await login(page, spec, spec.settings.project);
  await page.locator('#message').filter({ hasText: 'Réponse backend invalide' }).waitFor();
  await page.unroute(latest);

  await page.evaluate(() => { document.body.dataset.requestTimeoutMs = '20'; });
  await page.route(latest, async route => {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); } catch (_) { /* request timed out as expected */ }
  });
  await login(page, spec, spec.settings.project);
  await page.locator('#message').filter({ hasText: 'délai imparti' }).waitFor();
  await page.unroute(latest);
  await page.evaluate(() => { delete document.body.dataset.requestTimeoutMs; });

  await page.route(latest, route => route.abort('internetdisconnected')); // Network loss must be visible to the operator.
  await login(page, spec, spec.settings.project);
  await page.locator('#message').filter({ hasText: 'Backend inaccessible' }).waitFor();
  await page.unroute(latest);
}

async function run(spec, output) {
  const browser = await chromium.launch({ executablePath: process.env.B06_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  const responses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => responses.push({ path: new URL(response.url()).pathname, status: response.status() }));
  try {
    await page.goto(`${spec.settings.url}/studio/`);
    await login(page, spec, 'b06-other');
    await page.locator('#message').filter({ hasText: '404' }).waitFor();
    assert.equal(await page.locator('#inspection').isVisible(), false);
    await login(page, spec, spec.settings.project);
    await waitState(page, 'awaiting_approval');
    assert.equal(await page.locator('#run-id').textContent(), spec.run.id);
    await page.locator('#run-list li').filter({ hasText: spec.run.id }).waitFor();
    const latestResponsesBeforeDoubleClick = responses.filter(response => response.path.includes('/latest')).length;
    await page.getByRole('button', { name: 'Actualiser' }).dblclick();
    await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
    const latestResponsesAfterDoubleClick = responses.filter(response => response.path.includes('/latest')).length;
    assert.equal(latestResponsesAfterDoubleClick - latestResponsesBeforeDoubleClick, 1);
    await page.getByText('Soumettre un dossier d’approbation signé').click();
    await page.locator('#approval-json').fill('{}');
    await page.getByRole('button', { name: 'Soumettre l’approbation' }).click();
    await page.locator('#message').filter({ hasText: '403' }).waitFor();
    await login(page, spec, spec.settings.project);
    await waitState(page, 'awaiting_approval');
    await page.locator('#approval-json').fill(JSON.stringify(require('./b06ClientFixture.cjs').approval(spec)));
    await page.getByRole('button', { name: 'Soumettre l’approbation' }).click();
    await waitState(page, 'completed');
    await page.getByRole('button', { name: 'Capturer un snapshot' }).click();
    await page.locator('#snapshots li').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
    assert.match(await page.locator('#promotion').textContent(), /completed/);
    const provenance = JSON.parse(await page.locator('#provenance').textContent());
    assert.equal(provenance.length, 1);
    assert.equal(provenance[0].assemblyAccepted, true);
    assert.equal(provenance[0].memories.length, 1);
    await page.screenshot({ path: path.join(output, 'studio.png'), fullPage: true });
    const result = { runId: spec.run.id, workspaceId: spec.settings.workspace,
      provenance, snapshotText: await page.locator('#snapshots').textContent(), errors };
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('#inspection').isVisible(), false);
    assert.equal(await page.locator('#provenance').textContent(), '');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
    await negativeUiCases(page, spec);
    return result;
  } catch (error) {
    fs.writeFileSync(path.join(output, 'studio-failure.json'), JSON.stringify({ message: await page.locator('#message').textContent(), errors, responses }));
    await page.screenshot({ path: path.join(output, 'studio-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
}

module.exports = { run };
