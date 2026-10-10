'use strict';
const assert = require('node:assert/strict');

async function run(page) {
  await page.evaluate(async () => {
    const target = document.createElement('div');
    target.id = 'record-browser-probe';
    document.getElementById('connection-panel').append(target);
    const { renderData } = await import('/studio/components.mjs');
    renderData(target.id, { items: [
      { id: 'first', name: 'Checkpoint initial', status: 'completed', truthValidated: false },
      { id: 'second', name: '<script>candidate</script>', status: 'queued', promotionGranted: false },
      { id: 'third', name: 'Observation sans verdict' }
    ] });
  });
  const root = page.locator('#record-browser-probe');
  assert.equal(await root.locator('[data-record-detail]:visible').count(), 1);
  assert.equal(await root.locator('[data-record-detail]:visible').getByText('Non', { exact: true }).count(), 1);
  await root.getByRole('button', { name: '<script>candidate</script>', exact: true }).click();
  assert.equal(await root.locator('[data-record-detail="1"]').isVisible(), true);
  assert.equal(await root.locator('script').count(), 0);
  await root.getByRole('searchbox', { name: 'Filtrer les dossiers' }).fill('initial');
  assert.equal(await root.locator('tbody tr:visible').count(), 1);
  assert.equal(await root.locator('[data-record-detail="0"]').isVisible(), true);
  await root.getByRole('searchbox').fill('introuvable');
  assert.equal(await root.locator('.record-empty').isVisible(), true);
  assert.equal(await root.locator('[data-record-detail]:visible').count(), 0);
  await root.getByRole('searchbox').fill('');
  assert.equal(await root.locator('tbody tr:visible').count(), 3);
  assert.equal(await root.locator('[data-status="unknown"]').textContent(), 'Inconnu');
  const selected = root.locator('[data-record-index="2"]');
  await selected.focus();
  await page.keyboard.press('Enter');
  assert.equal(await selected.getAttribute('aria-pressed'), 'true');
  await root.evaluate(element => element.remove());
}

module.exports = { run };
