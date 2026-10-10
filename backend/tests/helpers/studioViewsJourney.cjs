'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { request } = require('./studioRequest.cjs');
const tasks = require('./studioTaskNavigation.cjs');

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
  await tasks.reveal(page, form);
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
  await tasks.reveal(page, page.locator('#events'));
  await page.locator('#events').filter({ hasText: 'OWN_BROWSER_EVENT' }).waitFor();
  assert.doesNotMatch(await page.locator('#events').textContent(), /PRIVATE_BROWSER_EVENT/);
  const reconnected = page.waitForResponse(response => response.url().endsWith('/api/telemetry/stream'));
  for (const client of telemetry.sseClients) client.res.end();
  await reconnected;
  await tasks.reveal(page, page.locator('#stream-status'));
  await page.locator('#stream-status').filter({ hasText: 'Connecté' }).waitFor();
  assert.equal(await page.locator('#events li').filter({ hasText: 'OWN_BROWSER_EVENT' }).count(), 1);
  await tasks.reveal(page, page.locator('#live-toggle'));
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
  await tasks.fill(page, page.locator('#file-content'), '<div>preuve navigateur é</div>');
}

async function editor(page, spec) {
  await page.locator('[data-target="files-view"]').click();
  await page.locator('#file-path').fill('browser-studio.html');
  await page.locator('#file-content').fill('<div>preuve navigateur é</div>');
  await saveWithDraftInFlight(page);
  const workspace = await spec.db.get("SELECT path FROM workspaces WHERE id='consumer-ws'");
  assert.equal(fs.readFileSync(path.join(workspace.path, 'browser-studio.html'), 'utf8'), '<div>preuve navigateur é</div>');
  const snapshot = await request({ ...spec, url: spec.settings.url }, '/api/workspaces/consumer-ws/snapshots',
    { timeoutMs: 30000, body: { label: 'Browser baseline', reason: 'Isolated test' } });
  await page.locator('#file-content').fill('brouillon à conserver');
  await page.locator('#file-diff-button').click();
  assert.match(await page.locator('#file-diff').textContent(), /brouillon/);
  const route = '/api/workspaces/consumer-ws/file?path=browser-studio.html';
  const current = await request({ ...spec, url: spec.settings.url }, route);
  await request({ ...spec, url: spec.settings.url }, route, { method: 'PUT',
    body: { version: current.value.version, contentBase64: Buffer.from('concurrent').toString('base64') } });
  await tasks.click(page, page.locator('#file-save'));
  await page.locator('#message').filter({ hasText: '409' }).waitFor();
  assert.equal(await page.locator('#file-content').inputValue(), 'brouillon à conserver');
  await page.context().setOffline(true);
  await page.locator('#file-save').click();
  await page.locator('#message').filter({ hasText: 'Backend inaccessible' }).waitFor();
  assert.equal(await page.locator('#file-content').inputValue(), 'brouillon à conserver');
  await page.context().setOffline(false);
  await tasks.fill(page, page.locator('#restore-id'), snapshot.value.id);
  await page.locator('#restore-preview').click();
  await loaded(page);
  await page.locator('#restore').click();
  await page.locator('#restore-result-summary').filter({ hasText: 'Snapshot de sécurité' }).waitFor();
  assert.match(await page.locator('#restore-result-summary').textContent(), /snp-/);
  assert.equal(await page.locator('#restore-result').isVisible(), false);
  await loaded(page);
  assert.equal(fs.readFileSync(path.join(workspace.path, 'browser-studio.html'), 'utf8'), '<div>preuve navigateur é</div>');
}

async function lab(page, spec) {
  await page.locator('[data-target="research-view"]').click();
  const protocol = await submit(page, { id: 'protocol-register', route: '/api/experiments/register-protocol',
    fields: { title: 'Browser research', seed: 7, protocol: '{"question":"Q?","falsification":"sortie différente"}', inputs: '{"case":"browser"}' } });
  assert.equal(protocol.executionStarted, false);
  assert.match(await page.locator('#research-result-summary').textContent(), /Exécution démarrée.*Non/s);
  assert.equal(await page.locator('#research-result').isVisible(), false);
  const claim = await submit(page, { id: 'claim-create', route: `/api/experiments/${protocol.experimentId}/evidence-ledger/claims`,
    fields: { statement: 'Hypothèse navigateur falsifiable' } });
  await tasks.fill(page, page.locator('#claim-choice'), claim.claim.claimId);
  await page.locator('#research-inspect').click();
  await page.locator('#research-claims').filter({ hasText: 'UNRESOLVED' }).waitFor();
  await loaded(page);
  const dataset = await submit(page, { id: 'dataset-create', route: '/api/evals/datasets', fields: { name: 'Browser dataset' } });
  await submit(page, { id: 'case-create', route: `/api/evals/datasets/${dataset.id}/cases`,
    fields: { input: '{"output":"exact"}', expected: '"exact"' } });
  const job = await submit(page, { id: 'job-create', route: '/api/evals/jobs' });
  await require('../../src/services/jobWorker').processOnce();
  await tasks.click(page, page.locator('#job-inspect'));
  await tasks.reveal(page, page.locator('#research-summary'));
  await page.locator('#research-summary').filter({ hasText: 'completed' }).waitFor();
  await loaded(page);
  const replay = await submit(page, { id: 'job-replay', route: `/api/evals/jobs/${job.id}/replay` });
  await tasks.fill(page, page.locator('#job-comparison'), job.id + ',' + replay.id);
  await page.locator('#jobs-compare').click();
  await tasks.reveal(page, page.locator('#research-summary'));
  await page.locator('#research-summary').filter({ hasText: 'Entrées capturées identiques : Oui' }).waitFor();
  assert.equal(await page.locator('#research-data').isVisible(), false);
  await loaded(page);
  const cancelled = await submit(page, { id: 'job-cancel', route: `/api/evals/jobs/${replay.id}/cancel` });
  assert.equal(cancelled.status, 'cancelled');
}

async function run(spec, output) {
  await spec.db.run("UPDATE access_keys SET role='admin' WHERE id='b06-key'");
  const browser = await chromium.launch(process.env.B06_BROWSER ? { executablePath: process.env.B06_BROWSER }
    : { channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(spec.settings.url + '/studio/');
    await login(page, spec);
    await supervision(page, spec);
    console.log('Studio browser: supervision passed.');
    await editor(page, spec);
    console.log('Studio browser: editor passed.');
    await lab(page, spec);
    console.log('Studio browser: laboratory passed.');
    const design = await require('./studioDesignJourney.cjs').run(page, spec, output);
    const accessibility = await require('./studioAccessibilityJourney.cjs').run(page, output);
    const navigation = await require('./studioNavigationJourney.cjs').run(page, spec, output);
    await page.setViewportSize({ width: 390, height: 844 });
    await tasks.view(page, 'files-view');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'studio-mobile.png'), fullPage: true });
    await page.locator('.session-context > summary').click();
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('#navigation').isVisible(), false);
    assert.equal(await page.locator('#file-content').inputValue(), '');
    assert.equal(await page.locator('#research-data').textContent(), '');
    for (const id of ['research-result-summary', 'management-result-summary', 'restore-result-summary', 'provenance-summary']) {
      assert.equal(await page.locator('#' + id).textContent(), '');
    }
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
    return { platform: process.platform, browserVersion: browser.version(), errors,
      supervision: true, tenantEventRefusal: true, reconnect: true, editorConflictDraft: true,
      durableRestore: true, protocol: true, frozenJobReplay: true, cancellation: true, mobile: true, navigation, accessibility, design };
  } catch (error) {
    console.error('Studio views failure:', { message: await page.locator('#message').textContent(), errors });
    await page.screenshot({ path: path.join(output, 'studio-views-failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
}

module.exports = { run };
