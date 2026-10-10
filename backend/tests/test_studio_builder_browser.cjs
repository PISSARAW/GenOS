'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const tasks = require('./helpers/studioTaskNavigation.cjs');
const output = path.join(__dirname, '../../.genos-tests/studio-builder-g');

async function click(page, spec) {
  await tasks.reveal(page, page.locator('#builder-' + spec.id));
  const [response] = await Promise.all([page.waitForResponse(response =>
    new URL(response.url()).pathname === spec.path && response.request().method() === (spec.method || 'POST')),
  page.locator('#builder-' + spec.id).click()]);
  assert.equal(response.status(), spec.status || 200, await response.text());
  const value = await response.json();
  await page.locator('#message').filter({ hasText: /État runtime chargé|Workflow changed/ }).waitFor();
  return value;
}

async function construct(page) {
  await tasks.fill(page, page.locator('#builder-name'), 'Parcours de construction');
  await tasks.fill(page, page.locator('#builder-node-label'), 'Entrée configurée');
  await page.locator('#builder-node-apply').click();
  await tasks.select(page, page.locator('#builder-add-kind'), 'output');
  await page.locator('#builder-node-add').click();
  await page.locator('#builder-node-label').fill('Vérification');
  await page.locator('#builder-node-apply').click();
  await tasks.select(page, page.locator('#builder-edge-source'), 'input');
  await page.locator('#builder-edge-target').selectOption('output-1');
  await page.locator('#builder-edge-add').click();
  await tasks.reveal(page, page.locator('#builder-json'));
  const graph = JSON.parse(await page.locator('#builder-json').inputValue());
  graph.extension = { preserved: 'unknown graph property' };
  graph.nodes[0].futureConfig = { preserved: true };
  graph.nodes[0].label = 'Libellé canonique';
  graph.edges[0].futureEdge = 'preserved';
  await page.locator('#builder-json').fill(JSON.stringify(graph));
  await page.locator('#builder-json-apply').click();
  assert.equal(await page.locator('#builder-node-label').inputValue(), 'Libellé canonique');
  await tasks.fill(page, page.locator('#builder-node-label'), 'Libellé harmonisé');
  await page.locator('#builder-node-apply').click();
  const patched = JSON.parse(await page.locator('#builder-json').inputValue());
  assert.equal(patched.nodes[0].label, 'Libellé harmonisé');
  assert.equal(patched.nodes[0].data.label, 'Libellé harmonisé');
  await staleLink(page);
  await tasks.fill(page, page.locator('#builder-metadata'), '{"futureMetadata":{"preserved":true}}');
  return click(page, { id: 'save', path: '/api/workflows', status: 201 });
}

async function staleLink(page) {
  const graph = JSON.parse(await page.locator('#builder-json').inputValue());
  graph.edges.reverse();
  const text = JSON.stringify(graph);
  await tasks.fill(page, page.locator('#builder-json'), text);
  await tasks.click(page, page.locator('#builder-edges button').first());
  await page.locator('#message').filter({ hasText: 'Appliquez le JSON modifié' }).waitFor();
  assert.equal(await page.locator('#builder-json').inputValue(), text);
  await tasks.click(page, page.locator('#builder-json-apply'));
}

async function execute(page, context) {
  const route = '/api/workflows/' + context.workflow.id;
  const validated = await click(page, { id: 'validate', path: route + '/validate' });
  assert.equal(validated.valid, true);
  await tasks.select(page, page.locator('#builder-status'), 'staging');
  const staged = await click(page, { id: 'save', path: route, method: 'PUT' });
  assert.equal(staged.version, 2);
  await tasks.fill(page, page.locator('#builder-run-input'), '{"fixture":"real structural worker"}');
  const run = await click(page, { id: 'run', path: route + '/runs', status: 202 });
  assert.equal(run.status, 'queued');
  await require('../src/services/jobWorker').processOnce();
  const persisted = await context.spec.db.get('SELECT * FROM workflow_runs WHERE id=?', run.id);
  assert.equal(persisted.status, 'completed');
  assert.equal(JSON.parse(persisted.output_json).nodes, 3);
  const spans = await context.spec.db.all('SELECT id FROM trace_spans WHERE trace_id=?', 'trace-' + run.id);
  assert.equal(spans.length, 3);
  await click(page, { id: 'observe', path: route + '/runs', method: 'GET' });
  assert.match(await page.locator('#builder-runs').textContent(), /completed/);
  return { route, runId: run.id, traceId: 'trace-' + run.id, staged };
}

async function conflicts(page, context) {
  const external = await request(context.spec, context.route, { method: 'PUT',
    body: { expectedVersion: 2, name: 'Modification concurrente' } });
  assert.equal(external.status, 200);
  await tasks.fill(page, page.locator('#builder-name'), 'Brouillon à conserver');
  await click(page, { id: 'save', path: context.route, method: 'PUT', status: 409 });
  assert.equal(await page.locator('#builder-name').inputValue(), 'Brouillon à conserver');
  assert.equal((await request(context.spec, context.route)).value.name, 'Modification concurrente');
  page.once('dialog', dialog => dialog.dismiss());
  await tasks.click(page, page.locator('#builder-load'));
  assert.equal(await page.locator('#builder-name').inputValue(), 'Brouillon à conserver');
  page.once('dialog', dialog => dialog.accept());
  await click(page, { id: 'load', path: context.route, method: 'GET' });
  await click(page, { id: 'publish', path: context.route, method: 'GET' });
  assert.equal(await page.locator('#production-view').isVisible(), true);
  const form = page.locator('[data-action="production-freeze"]');
  assert.equal(await form.locator('[name="workflowId"]').inputValue(), context.route.split('/').at(-1));
  assert.equal(await form.locator('[name="version"]').inputValue(), '3');
  await page.locator('[data-target="builder-view"]').click();
}

function fingerprints() {
  const root = path.join(__dirname, '../..');
  const files = fs.readdirSync(path.join(root, 'integrations/studio')).filter(file => /\.(mjs|js|css|html)$/.test(file))
    .map(file => 'integrations/studio/' + file);
  files.push('backend/src/controllers/workflowController.js', 'backend/src/controllers/validation/workflowVersion.js',
    'backend/src/services/jobWorkerWorkflow.js', 'backend/tests/test_studio_builder_browser.cjs');
  return Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
}

async function publishedLifecycle(page, context) {
  const published = await request(context.spec, context.route, { method: 'PUT',
    body: { expectedVersion: 3, status: 'published' } });
  assert.equal(published.status, 200);
  await click(page, { id: 'load', path: context.route, method: 'GET' });
  await tasks.fill(page, page.locator('#builder-name'), 'Modification interdite');
  await tasks.click(page, page.locator('#builder-save'));
  await page.locator('#message').filter({ hasText: 'Version publiée immuable' }).waitFor();
  assert.equal((await request(context.spec, context.route)).value.version, 4);
  await tasks.fill(page, page.locator('#builder-name'), published.value.name);
  await tasks.select(page, page.locator('#builder-status'), 'archived');
  const archived = await click(page, { id: 'save', path: context.route, method: 'PUT' });
  assert.equal(archived.status, 'archived');
  assert.deepEqual(archived.graph, published.value.graph);
}

async function probe(spec) {
  const browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(spec.url + '/studio/');
    for (const id of ['organization', 'project', 'agent']) await page.locator('#' + id).fill(spec.settings[id]);
    await page.locator('#token').fill(spec.token);
    await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
    await page.locator('#run-status').filter({ hasText: 'awaiting_approval' }).waitFor();
    await page.locator('[data-target="builder-view"]').click();
    assert.equal(new URL(page.url()).hash, '#/construire?run=' + spec.run.id);
    const workflow = await construct(page);
    assert.equal(workflow.status, 'draft');
    assert.equal(workflow.graph.nodes[0].futureConfig.preserved, true);
    const result = await execute(page, { workflow, spec });
    await conflicts(page, { ...result, spec });
    await click(page, { id: 'observe', path: result.route + '/runs', method: 'GET' });
    assert.match(await page.locator('#builder-workflow option:checked').textContent(), /v3/);
    await tasks.reveal(page, page.locator('#builder-save'));
    await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(output, 'studio-builder-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const unnamed = await page.locator('#builder-view input, #builder-view select, #builder-view textarea').evaluateAll(elements =>
      elements.filter(element => !element.labels?.length).map(element => element.id));
    assert.deepEqual(unnamed, []);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'studio-builder-mobile.png'), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.locator('[data-node-id="output"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#builder-node-id').inputValue(), 'output');
    await publishedLifecycle(page, { ...result, spec });
    await tasks.click(page, page.locator('#disconnect'));
    assert.equal(await page.locator('#builder-name').inputValue(), '');
    assert.equal(await page.locator('#builder-runs').textContent(), '');
    assert.equal(await page.locator('#builder-workflow option').count(), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'studio-builder-qualified.json'), JSON.stringify({ revision:
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    qualifiedAt: new Date().toISOString(), workflowId: workflow.id, runId: result.runId, traceId: result.traceId,
    sourceHashes: fingerprints(), apiInterception: false, errors,
    limits: ['Structural input/output worker, not external LLM quality', 'Workflow slice, not complete agent/provider/tool catalog'],
    accessibility: { mobile390: true, text200: true, labels: true, graphKeyboard: true } }, null, 2));
    console.log('Studio builder: visual/JSON creation, real version save, staging worker, stale conflict, publication handoff and purge passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'studio-builder-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
