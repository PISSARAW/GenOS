'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { request } = require('./studioRequest.cjs');

async function loaded(page) {
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
}

async function login(page, spec) {
  await page.locator('#token').fill(spec.token);
  await page.locator('#organization').fill('b06-org');
  await page.locator('#project').fill('b06-project');
  await page.locator('#agent').fill('consumer-promotion-agent');
  await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
  await page.locator('#run-status').filter({ hasText: 'completed' }).waitFor();
  await loaded(page);
}

async function submit(page, options) {
  const form = page.locator(`form[data-action="${options.id}"]`);
  await form.locator('..').locator('summary').click();
  for (const [name, value] of Object.entries(options.fields || {})) await form.locator(`[name="${name}"]`).fill(String(value));
  const response = page.waitForResponse(value => value.url().endsWith(options.route) && value.request().method() === 'POST');
  await form.locator('button').click();
  const result = await response;
  assert.ok(result.ok(), await result.text());
  await loaded(page);
  return result.json();
}

async function supervision(page, spec) {
  await page.locator('[data-target="dashboard-view"]').click();
  await page.locator('#stream-status').filter({ hasText: 'Connecté' }).waitFor();
  assert.equal(await page.locator('#dashboard-stats li').count(), 3);
  const telemetry = require('../../src/services/telemetryObserver');
  telemetry.emitEvent({ eventType: 'STUDIO_OWN_EVENT', detail: 'OWN_BROWSER_EVENT', agentId: 'consumer-promotion-agent',
    payload: { organizationId: 'b06-org', projectId: 'b06-project' } });
  telemetry.emitEvent({ eventType: 'STUDIO_PRIVATE_EVENT', detail: 'PRIVATE_BROWSER_EVENT',
    payload: { organizationId: 'b06-org', projectId: 'b06-other' } });
  await page.locator('#events').filter({ hasText: 'OWN_BROWSER_EVENT' }).waitFor();
  assert.doesNotMatch(await page.locator('#events').textContent(), /PRIVATE_BROWSER_EVENT/);
  const reconnected = page.waitForResponse(response => response.url().endsWith('/api/telemetry/stream'));
  for (const client of telemetry.sseClients) client.res.end();
  await reconnected;
  await page.locator('#stream-status').filter({ hasText: 'Connecté' }).waitFor();
  assert.equal(await page.locator('#events li').filter({ hasText: 'OWN_BROWSER_EVENT' }).count(), 1);
  await page.locator('#live-toggle').uncheck();
  await page.locator('#stream-status').filter({ hasText: 'Actualisation manuelle' }).waitFor();
}

async function saveWithDraftInFlight(page) {
  let accepted;
  let release;
  const received = new Promise(resolve => { accepted = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  const pattern = '**/api/workspaces/consumer-ws/file?**';
  await page.route(pattern, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch();
    accepted();
    await paused;
    await route.fulfill({ response });
  });
  await page.locator('#file-save').click();
  await received;
  await page.locator('#file-content').fill('modification pendant sauvegarde');
  release();
  await page.locator('#file-result').filter({ hasText: 'Sauvegarde vérifiée' }).waitFor();
  await loaded(page);
  await page.unroute(pattern);
  await page.locator('#file-diff-button').click();
  assert.match(await page.locator('#file-diff').textContent(), /modification pendant sauvegarde/);
  await page.locator('#file-content').fill('<div>preuve navigateur é</div>');
}

async function editor(page, spec) {
  await page.locator('[data-target="files-view"]').click();
  await page.locator('#file-path').fill('browser-studio.html');
  await page.locator('#file-content').fill('<div>preuve navigateur é</div>');
  await saveWithDraftInFlight(page);
  const workspace = await spec.db.get("SELECT path FROM workspaces WHERE id='consumer-ws'");
  assert.equal(fs.readFileSync(path.join(workspace.path, 'browser-studio.html'), 'utf8'), '<div>preuve navigateur é</div>');
  const snapshot = await request({ ...spec, url: spec.settings.url }, '/api/workspaces/consumer-ws/snapshots', { body: { label: 'Browser baseline', reason: 'Isolated test' } });
  await page.locator('#file-content').fill('brouillon à conserver');
  await page.locator('#file-diff-button').click();
  assert.match(await page.locator('#file-diff').textContent(), /brouillon/);
  const route = '/api/workspaces/consumer-ws/file?path=browser-studio.html';
  const current = await request({ ...spec, url: spec.settings.url }, route);
  await request({ ...spec, url: spec.settings.url }, route, { method: 'PUT',
    body: { version: current.value.version, contentBase64: Buffer.from('concurrent').toString('base64') } });
  await page.locator('#file-save').click();
  await page.locator('#message').filter({ hasText: '409' }).waitFor();
  assert.equal(await page.locator('#file-content').inputValue(), 'brouillon à conserver');
  await page.context().setOffline(true);
  await page.locator('#file-save').click();
  await page.locator('#message').filter({ hasText: 'Backend inaccessible' }).waitFor();
  assert.equal(await page.locator('#file-content').inputValue(), 'brouillon à conserver');
  await page.context().setOffline(false);
  await page.locator('#restore-id').fill(snapshot.value.id);
  await page.locator('#restore-preview').click();
  await loaded(page);
  await page.locator('#restore').click();
  await page.locator('#restore-result').filter({ hasText: 'snp-' }).waitFor();
  await loaded(page);
  assert.equal(fs.readFileSync(path.join(workspace.path, 'browser-studio.html'), 'utf8'), '<div>preuve navigateur é</div>');
}

async function lab(page, spec) {
  await page.locator('[data-target="research-view"]').click();
  const protocol = await submit(page, { id: 'protocol-register', route: '/api/experiments/register-protocol',
    fields: { title: 'Browser research', seed: 7, protocol: '{"question":"Q?","falsification":"sortie différente"}', inputs: '{"case":"browser"}' } });
  assert.equal(protocol.executionStarted, false);
  const claim = await submit(page, { id: 'claim-create', route: `/api/experiments/${protocol.experimentId}/evidence-ledger/claims`,
    fields: { statement: 'Hypothèse navigateur falsifiable' } });
  await page.locator('#claim-choice').fill(claim.claim.claimId);
  await page.locator('#research-inspect').click();
  await page.locator('#research-claims').filter({ hasText: 'UNRESOLVED' }).waitFor();
  await loaded(page);
  const dataset = await submit(page, { id: 'dataset-create', route: '/api/evals/datasets', fields: { name: 'Browser dataset' } });
  await submit(page, { id: 'case-create', route: `/api/evals/datasets/${dataset.id}/cases`,
    fields: { input: '{"output":"exact"}', expected: '"exact"' } });
  const job = await submit(page, { id: 'job-create', route: '/api/evals/jobs' });
  await require('../../src/services/jobWorker').processOnce();
  await page.locator('#job-inspect').click();
  await page.locator('#research-summary').filter({ hasText: 'completed' }).waitFor();
  await loaded(page);
  const replay = await submit(page, { id: 'job-replay', route: `/api/evals/jobs/${job.id}/replay` });
  await page.locator('#job-comparison').fill(job.id + ',' + replay.id);
  await page.locator('#jobs-compare').click();
  await page.locator('#research-summary').filter({ hasText: 'Entrées capturées identiques : Oui' }).waitFor();
  assert.equal(await page.locator('#research-data').isVisible(), false);
  await loaded(page);
  const cancelled = await submit(page, { id: 'job-cancel', route: `/api/evals/jobs/${replay.id}/cancel` });
  assert.equal(cancelled.status, 'cancelled');
}

async function run(spec, output) {
  await spec.db.run("UPDATE access_keys SET role='admin' WHERE id='b06-key'");
  const browser = await chromium.launch({ executablePath: process.env.B06_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(spec.settings.url + '/studio/');
    await login(page, spec);
    await supervision(page, spec);
    await editor(page, spec);
    await lab(page, spec);
    const navigation = await require('./studioNavigationJourney.cjs').run(page, spec, output);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-target="files-view"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'studio-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('#navigation').isVisible(), false);
    assert.equal(await page.locator('#file-content').inputValue(), '');
    assert.equal(await page.locator('#research-data').textContent(), '');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
    return { platform: process.platform, browserVersion: browser.version(), errors,
      supervision: true, tenantEventRefusal: true, reconnect: true, editorConflictDraft: true,
      durableRestore: true, protocol: true, frozenJobReplay: true, cancellation: true, mobile: true, navigation };
  } catch (error) {
    console.error('Studio views failure:', { message: await page.locator('#message').textContent(), errors });
    await page.screenshot({ path: path.join(output, 'studio-views-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
}

module.exports = { run };
