'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { ensureQuantityIncrementBehavior } = require('../src/services/workerCodeQuantityIncrementRepair');
const { removeQuantityCollisionsAfterReload } = require('../src/services/workerCodeQuantityRepair');

const source = `<!doctype html><h1>Pantry</h1><table><tbody id="items"></tbody></table><script>
function render(){const items=JSON.parse(localStorage.getItem('pantryItems')||'[]');document.querySelector('#items').innerHTML=items.map(item=>'<tr><td>'+item.name+'</td><td>'+item.quantity+'</td><td>Food</td><td>2026-11-30</td><td><button>Increase quantity</button></td></tr>').join('');}
render();
</script></body>`;
const cardSource = `<!doctype html><h1>Pantry</h1><form><label for="qty">Quantity</label><input id="qty" type="number" aria-label="Quantity"></form><div data-item-row data-item-name="Oats"><span>Oats</span><span id="cardQuantity">2</span><button aria-label="Increase quantity for Oats">Increase quantity</button><button aria-label="Decrease quantity for Oats">Decrease quantity</button></div><script>const saved=JSON.parse(localStorage.getItem('pantry')||'[]');if(saved[0])document.querySelector('#cardQuantity').textContent=saved[0].quantity;</script></body>`;
const listSource = '<!doctype html><h1>Pantry</h1><ul><li data-item-row data-item-name="Oats">Oats <span>2</span></li></ul></body>';
const placeholderSource = '<!doctype html><div class="item"><label>Name</label><input aria-label="Item name"></div></body>';

async function main() {
  const html = ensureQuantityIncrementBehavior(source);
  const refreshed = ensureQuantityIncrementBehavior(html);
  assert.equal((refreshed.match(/function genosQuantityIncrementRepair/g) || []).length, 1);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(request.url === '/card'
      ? ensureQuantityIncrementBehavior(removeQuantityCollisionsAfterReload(cardSource))
      : request.url === '/list' ? ensureQuantityIncrementBehavior(listSource)
        : request.url === '/placeholder' ? ensureQuantityIncrementBehavior(placeholderSource) : refreshed);
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
    await page.goto(`http://127.0.0.1:${server.address().port}/card`);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.evaluate(() => localStorage.setItem('pantry', JSON.stringify([
      { name: 'Oats', itemName: 'Oats', quantity: 2 }
    ])));
    await page.reload();
    await page.getByRole('button', { name: 'Increase quantity for Oats' }).click();
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('pantry')))[0].quantity, 3);
    assert.equal(await page.getByLabel(/quantity/i).count(), 1);
    await page.reload();
    assert.equal(await page.locator('#cardQuantity').innerText(), '3');
    assert.equal(await page.getByLabel(/quantity/i).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Decrease Oats' }).count(), 1);
    await page.goto(`http://127.0.0.1:${server.address().port}/list`);
    await page.evaluate(() => localStorage.setItem('pantry', JSON.stringify([{ name: 'Oats', quantity: 2 }])));
    await page.reload();
    await page.getByRole('button', { name: 'Increase quantity for Oats' }).click();
    assert.match(await page.locator('li').innerText(), /Oats\s+3/);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('pantry')))[0].quantity, 3);
    await page.goto(`http://127.0.0.1:${server.address().port}/placeholder`);
    assert.equal(await page.getByRole('button', { name: 'Increase quantity for Name' }).count(), 0);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Quantity increment persistence browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
