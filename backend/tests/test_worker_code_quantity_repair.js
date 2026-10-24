'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { removeQuantityCollisionsAfterReload } = require('../src/services/workerCodeQuantityRepair');
const { ensureQuantityIncrementBehavior } = require('../src/services/workerCodeQuantityIncrementRepair');

const source = `<!doctype html><h1>Pantry</h1><form><label for="quantity">Quantity</label><input id="quantity" type="number"><button type="submit">Add Item</button></form><table><tbody id="items"></tbody></table><script>
const storageKey='pantry';const body=document.querySelector('#items');function render(){const items=JSON.parse(localStorage.getItem(storageKey)||'[]');body.innerHTML=items.map(item=>'<tr><td>'+item.name+'</td><td>'+item.quantity+'</td><td><button aria-label="Increase quantity for '+item.name+'">Increase quantity</button><button aria-label="Decrease quantity for '+item.name+'">Decrease quantity</button></td></tr>').join('');body.querySelectorAll('button[aria-label^="Increase"]').forEach(button=>button.onclick=()=>{const items=JSON.parse(localStorage.getItem(storageKey));items[0].quantity++;localStorage.setItem(storageKey,JSON.stringify(items));render();});}window.addEventListener('load',render);document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();localStorage.setItem(storageKey,JSON.stringify([{name:'Oats',quantity:2}]));render();});
</script></body>`;

async function main() {
  const html = removeQuantityCollisionsAfterReload(source);
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
    await page.getByLabel(/quantity/i).fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    await page.getByRole('button', { name: 'Increase quantity for Oats' }).click();
    await page.reload();
    assert.equal(await page.getByLabel(/quantity/i).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Increase Oats' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Decrease Oats' }).count(), 1);
    assert.match(await page.locator('tbody').innerText(), /Oats\s+3/);
    const missingButton = '<div class="item">Name: Oats, Qty: <input type="number" value="2"></div><script>localStorage.getItem("pantry");</script>';
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => localStorage.setItem('pantry', JSON.stringify([{ name: 'Oats', qty: 2 }])));
    await page.setContent(ensureQuantityIncrementBehavior(missingButton));
    assert.equal(await page.getByRole('button', { name: 'Increase quantity for Oats' }).count(), 1);
    await page.getByRole('button', { name: 'Increase quantity for Oats' }).click();
    assert.equal(await page.locator('.item input').inputValue(), '3');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('pantry')))[0].qty, 3);
    await page.evaluate(() => sessionStorage.clear());
    const savedQty = '<form><input aria-label="Quantity" type="number"></form><ul><li data-item-row data-item-name="Oats">Oats <span>3</span><button aria-label="Increase quantity for Oats">+</button></li></ul><script>localStorage.setItem("pantry",JSON.stringify([{name:"Oats",qty:3}]))</script></body>';
    await page.setContent(removeQuantityCollisionsAfterReload(savedQty));
    assert.equal(await page.getByLabel(/quantity/i).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Increase Oats' }).count(), 1);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Quantity collision repair browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
