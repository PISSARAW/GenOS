'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { removeQuantityCollisionsAfterReload } = require('../src/services/workerCodeQuantityRepair');

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
    assert.equal(await page.getByRole('button', { name: 'Increase quantity for Oats' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Decrease quantity for Oats' }).count(), 1);
    assert.match(await page.locator('tbody').innerText(), /Oats\s+3/);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Quantity collision repair browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
