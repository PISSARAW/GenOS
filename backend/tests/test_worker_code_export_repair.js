'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('playwright');
const { ensureJsonExport } = require('../src/services/workerCodeExportRepair');

async function main() {
  const source = '<!doctype html><button onclick="exportPantry()" aria-label="Export JSON">Export</button>'
    + '<button id="exportCsv" onclick="window.csvClicked=true">Export CSV</button>'
    + '<script>function broken( {</script><script>function exportPantry(){throw new Error("stale handler")}</script>';
  const result = ensureJsonExport(source);
  assert.match(result, /link\.download='pantry\.json'/);
  assert.match(result, /<\/script><script>function exportPantryJSON\(\)/);
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(result);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => localStorage.setItem('pantry', JSON.stringify([{ name: 'Oats', quantity: 3 }])));
    assert.equal(await page.getByRole('button', { name: /export json|export csv/i }).count(), 1);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'pantry.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), 'utf8')),
      [{ name: 'Oats', quantity: 3 }]);
    await page.getByRole('button', { name: 'CSV file' }).click();
    assert.equal(await page.evaluate(() => window.csvClicked), true);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Pantry download button repair checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
