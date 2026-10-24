'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { repairPlan } = require('../src/services/workerCodeTestRepairRules');
const { ensureDeleteBehavior } = require('../src/services/workerCodeDeleteRepair');

async function main() {
  const failure = { proposal: { tests: [{ stderr: 'AssertionError: item can be deleted at acceptance.cjs:26:10' }] } };
  assert.deepEqual(repairPlan(failure), { kind: 'ensure_delete_behavior', label: 'Delete item' });
  const html = ensureDeleteBehavior('<h1>Pantry</h1><div data-item-row data-item-name="Oats">Oats <button aria-label="Delete Oats">Delete</button></div>');
  const server = http.createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => localStorage.setItem('pantry', JSON.stringify([{ name: 'Oats', quantity: 2 }])));
    await page.getByRole('button', { name: 'Delete Oats' }).click();
    assert.equal(await page.locator('[data-item-row]').count(), 0);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('pantry'))), []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Delete behavior repair browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
