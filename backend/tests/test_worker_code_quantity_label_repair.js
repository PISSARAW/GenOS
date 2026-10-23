'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { labelQuantityInput } = require('../src/services/workerCodeQuantityInputRepair');

async function main() {
  const html = labelQuantityInput('<form><label for="quantity" aria-label="Quantity">Quantity:</label><input id="quantity" type="number" aria-label="Quantity"></form>');
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.getByLabel(/quantity/i).count(), 1);
    await page.getByLabel(/quantity/i).fill('2');
    assert.equal(await page.locator('#quantity').inputValue(), '2');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Quantity accessible label de-duplication check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
