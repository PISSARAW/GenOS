'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { ensureQuantityIncrementBehavior } = require('../src/services/workerCodeQuantityIncrementRepair');

const source = `<!doctype html><h1>Pantry</h1><table><tbody id="items"></tbody></table><script>
function render(){const items=JSON.parse(localStorage.getItem('pantryItems')||'[]');document.querySelector('#items').innerHTML=items.map(item=>'<tr><td>'+item.name+'</td><td>'+item.quantity+'</td><td>Food</td><td>2026-11-30</td><td><button>Increase quantity</button></td></tr>').join('');}
render();
</script></body>`;

async function main() {
  const html = ensureQuantityIncrementBehavior(source);
  const refreshed = ensureQuantityIncrementBehavior(html);
  assert.equal((refreshed.match(/function genosQuantityIncrementRepair/g) || []).length, 1);
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(refreshed);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(2000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => localStorage.setItem('pantryItems', JSON.stringify([
      { name: 'Oats', itemName: 'Oats', quantity: 2, category: 'Food' }
    ])));
    await page.reload();
    await page.getByRole('button', { name: /increase quantity/i }).click();
    assert.match(await page.locator('tbody').innerText(), /Oats\s+3/);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('pantryItems')))[0].quantity, 3);
    await page.reload();
    assert.match(await page.locator('tbody').innerText(), /Oats\s+3/);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Quantity increment persistence browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
