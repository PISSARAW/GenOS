'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { AxeBuilder } = require('@axe-core/playwright');

async function tabs(page) {
  await page.locator('[data-target=inspection]').click();
  await page.locator('#trace-timeline-tab').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#trace-steps-tab').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#trace-steps').isVisible(), true);
  assert.equal(await page.locator('#trace-timeline').isVisible(), false);
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#trace-timeline').isVisible(), true);
  assert.equal(await page.locator('#run-list [aria-current=true]').count(), 1);
}

async function filters(page) {
  await page.locator('[data-target=management-view]').click();
  await page.locator('#management-action-filter').fill('agent');
  assert.ok(await page.locator('#management-actions details:visible').count() > 0);
  assert.equal(await page.locator('form[data-action=project-create]').locator('..').isVisible(), false);
  await page.locator('#management-action-filter').fill('aucune-action-xyz');
  assert.equal(await page.locator('#management-actions details:visible').count(), 0);
  assert.match(await page.locator('#management-filter-status').textContent(), /0 action/);
  await page.locator('#management-action-filter').fill('');
  await page.locator('[data-target=files-view]').click();
  await page.locator('#files-refresh').click();
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
  await page.locator('#file-query').fill('a/verify');
  assert.equal(await page.locator('#file-list button').count(), 1);
  await page.locator('#file-list button').click();
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
  assert.equal(await page.locator('#file-list button').getAttribute('aria-current'), 'true');
  await page.locator('#file-query').fill('not-present');
  assert.match(await page.locator('#file-list').textContent(), /Aucun fichier/);
  await page.locator('#file-query').fill('');
}

async function lineage(page, spec) {
  await spec.db.run("INSERT INTO lineage_nodes (id,workspace_id,label,node_type,state_summary) VALUES ('studio-design-root','consumer-ws','Source fixture','core','Source isolée de test')");
  await spec.db.run("INSERT INTO lineage_nodes (id,workspace_id,label,node_type,state_summary) VALUES ('studio-design-fork','consumer-ws','Alternative fixture','fork','Branche isolée, aucune promotion')");
  await spec.db.run("INSERT INTO lineage_edges (id,workspace_id,source_node_id,target_node_id,edge_type) VALUES ('studio-design-edge','consumer-ws','studio-design-root','studio-design-fork','fork')");
  await page.locator('[data-target=dashboard-view]').click();
  await page.locator('#dashboard-refresh').click();
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
  const node = page.locator('#lineage-graph [role=button]').filter({ has: page.locator('text', { hasText: 'Alternative fixture' }) });
  await node.focus();
  await page.keyboard.press('Enter');
  assert.equal(await node.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#lineage-detail').textContent(), /Branche isolée, aucune promotion/);
}

async function accessibility(page, output) {
  for (const view of ['inspection', 'dashboard-view', 'management-view', 'files-view', 'research-view']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-target="' + view + '"]').click();
    const result = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(n => n.target) })), [], view);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, view + '-design-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, view);
    const mobile = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(mobile.violations.map(item => item.id), [], view + ' mobile');
    await page.screenshot({ path: path.join(output, view + '-design-mobile.png'), fullPage: true });
    const drawers = await page.locator('[data-mobile-drawer]:visible').all();
    for (const drawer of drawers) {
      assert.equal(await drawer.getAttribute('open'), null);
      await drawer.locator(':scope > summary').click();
    }
    const expanded = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(expanded.violations.map(item => item.id), [], view + ' expanded mobile');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, view + ' expanded');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function run(page, spec, output) {
  await tabs(page);
  await filters(page);
  await lineage(page, spec);
  await accessibility(page, output);
  await page.locator('[data-target=research-view]').click();
  assert.equal(await page.locator('.comparison-scroll table').count(), 1);
  assert.match(await page.locator('.comparison-scroll').textContent(), /Inconnu ≠ zéro/);
  await page.screenshot({ path: path.join(output, 'studio-design-comparison.png'), fullPage: true });
  const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
  assert.equal(new Set(ids).size, ids.length);
  return { keyboardTabs: true, selectedRun: true, commandFilters: true, fileFilterSelection: true,
    realFixtureLineage: true, alignedComparison: true, axeFiveViews: true, mobileDrawers: true, uniqueIds: true };
}

module.exports = { run };
