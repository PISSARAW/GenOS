'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const tasks = require('./helpers/studioTaskNavigation.cjs');
const output = path.join(__dirname, '../../.genos-tests/studio-density');

async function login(page, spec) {
  await page.goto(spec.url + '/studio/');
  for (const id of ['organization', 'project', 'agent']) await page.locator('#' + id).fill(spec.settings[id]);
  await page.locator('#token').fill(spec.token);
  await page.getByRole('button', { name: 'Ouvrir l’exécution' }).click();
  await page.locator('#run-status').filter({ hasText: 'awaiting_approval' }).waitFor();
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
}

async function bounds(page) {
  const value = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth, viewportHeight: innerHeight,
    main: document.querySelector('main').getBoundingClientRect().toJSON(),
    active: document.querySelector('[data-view]:not([hidden])')?.id
  }));
  assert.ok(value.width <= value.viewportWidth + 1, JSON.stringify(value));
  assert.ok(value.height <= value.viewportHeight + 1, JSON.stringify(value));
  assert.ok(value.main.bottom <= value.viewportHeight + 1, JSON.stringify(value));
  assert.equal(await page.locator('[data-view]:not([hidden]) > .task-deck > .task-pane:not([hidden])').count(), 1);
  return value;
}

async function allViews(page) {
  const ids = await page.locator('[data-view]').evaluateAll(elements => elements.map(element => element.id));
  const measured = [];
  for (const id of ids) {
    await tasks.view(page, id);
    measured.push(await bounds(page));
    const root = page.locator('#' + id);
    const picker = root.locator('.task-pane:not([hidden]) .operation-choice select');
    if (await picker.count()) {
      assert.equal(await root.locator('.task-pane:not([hidden]) .operation-pane:not([hidden])').count(), 1);
    }
  }
  return measured;
}

async function drafts(page) {
  await tasks.view(page, 'builder-view');
  await tasks.fill(page, page.locator('#builder-name'), 'Brouillon conservé');
  await tasks.reveal(page, page.locator('#builder-node-label'));
  assert.equal(await page.locator('#builder-name').inputValue(), 'Brouillon conservé');
  assert.equal(await page.locator('#builder-node-prompt').isVisible(), false);
  await tasks.select(page, page.locator('#builder-node-kind'), 'llm');
  assert.equal(await page.locator('#builder-node-prompt').isVisible(), true);
  await page.locator('#builder-node-prompt').fill('Instruction à conserver');
  await tasks.fill(page, page.locator('#builder-name'), 'Brouillon conservé');
  await tasks.reveal(page, page.locator('#builder-node-label'));
  assert.equal(await page.locator('#builder-node-prompt').inputValue(), 'Instruction à conserver');
  const dialog = await page.locator('#node-inspector-dialog').evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
  assert.ok(dialog.content <= dialog.height + 1, JSON.stringify(dialog));
  await page.screenshot({ path: path.join(output, 'studio-focused-node.png') });
  await page.keyboard.press('Escape');
  const tab = page.locator('#builder-view .task-tabs [aria-selected="true"]');
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#builder-view .task-tabs [aria-selected="true"]').textContent(), 'Configuration');
  await tasks.reveal(page, page.locator('#builder-save'));
  const pane = await page.locator('#builder-view-task-graph').evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
  assert.ok(pane.content <= pane.height + 1, JSON.stringify(pane));
  await page.screenshot({ path: path.join(output, 'studio-focused-builder.png') });
}

async function operations(page) {
  await tasks.view(page, 'production-view');
  const form = page.locator('[data-action="production-freeze"]');
  await tasks.reveal(page, form);
  await form.locator('[name="workflowId"]').fill('Brouillon de version');
  const select = page.locator('#production-actions-choice');
  const ids = await select.locator('option').evaluateAll(elements => elements.map(element => element.value));
  await select.selectOption(ids.find(id => id !== 'production-freeze'));
  await select.selectOption('production-freeze');
  assert.equal(await form.locator('[name="workflowId"]').inputValue(), 'Brouillon de version');
  assert.equal(await page.locator('#production-view .operation-pane:not([hidden])').count(), 1);
  await bounds(page);
  await page.screenshot({ path: path.join(output, 'studio-focused-production.png') });
}

async function mobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await allViews(page);
  await tasks.view(page, 'builder-view');
  await tasks.reveal(page, page.locator('#builder-node-label'));
  assert.equal(await page.locator('#node-inspector-dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#node-inspector-dialog').isVisible(), false);
  await tasks.reveal(page, page.locator('#builder-save'));
  await page.screenshot({ path: path.join(output, 'studio-focused-mobile.png') });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await allViews(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
}

function hashes() {
  const root = path.join(__dirname, '../..');
  const files = fs.readdirSync(path.join(root, 'integrations/studio')).filter(file => /\.(mjs|js|css|html)$/.test(file));
  return Object.fromEntries(files.map(file => ['integrations/studio/' + file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'integrations/studio', file))).digest('hex')]));
}

async function probe(spec) {
  const browser = await chromium.launch({ channel: process.env.B06_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  fs.mkdirSync(output, { recursive: true });
  try {
    await login(page, spec);
    const desktop = await allViews(page);
    await drafts(page);
    await operations(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    const compact = await allViews(page);
    await tasks.reveal(page, page.locator('#builder-save'));
    const graph = await page.locator('#builder-view-task-graph').evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }));
    assert.ok(graph.content <= graph.height + 1, JSON.stringify(graph));
    await page.screenshot({ path: path.join(output, 'studio-focused-compact.png') });
    await mobile(page);
    await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
    assert.equal(await page.locator('#node-inspector-dialog').isVisible(), false);
    assert.equal(await page.locator('#builder-name').inputValue(), '');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'qualified.json'), JSON.stringify({
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
      qualifiedAt: new Date().toISOString(), sourceHashes: hashes(), apiInterception: false,
      desktop, compact, mobile390: true, text200: true, draftsPreserved: true, errors,
      limits: ['Long datasets and forms remain locally scrollable; no claim that every content fits at any zoom.']
    }, null, 2));
    console.log('Studio density: every view bounded, one task/action, preserved drafts, keyboard, mobile, zoom and purge passed.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Studio density:', errors);
    throw error;
  } finally { await browser.close(); }
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
