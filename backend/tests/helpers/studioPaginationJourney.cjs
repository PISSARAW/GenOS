'use strict';
const assert = require('node:assert/strict');

async function search(page, query) {
  await page.locator('#run-query').fill(query);
  await page.locator('#run-search button').click();
  await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
}

async function run(page, spec) {
  for (let index = 0; index < 21; index += 1) {
    await spec.db.run(`INSERT INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, created_at)
      SELECT ?, agent_id, contract_id, contract_version, 'planned', '2000-01-01' FROM strategy_execution_runs WHERE id = ?`,
    'merge-page-' + index, spec.run.id);
  }
  try {
    await search(page, 'merge-page-');
    assert.equal(await page.locator('#run-list button').count(), 20);
    await page.locator('#run-more').click();
    await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
    assert.equal(await page.locator('#run-list button').count(), 21);
    assert.equal(await page.locator('#run-more').isVisible(), false);
    await search(page, 'merge-page-');
    await page.locator('#run-query').fill(spec.run.id);
    await page.locator('#run-more').click();
    await page.locator('#message').filter({ hasText: 'État runtime chargé' }).waitFor();
    assert.equal(await page.locator('#run-list button').count(), 1);
    assert.match(await page.locator('#run-list').textContent(), new RegExp(spec.run.id));
    await search(page, 'merge-no-such-run');
    assert.match(await page.locator('#run-list').textContent(), /Aucun run trouvé/);
  } finally {
    await spec.db.run("DELETE FROM strategy_execution_runs WHERE id GLOB 'merge-page-*'");
    await search(page, '');
  }
}

module.exports = { run };
