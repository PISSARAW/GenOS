'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { ensureAddItemBehavior } = require('../src/services/workerCodeAddRepair');

const source = `<!doctype html><h1>Pantry</h1><form id="pantryForm"><label for="name">Item name</label><input id="name" name="name" aria-label="Item name"><label for="quantity">Quantity</label><input id="quantity" name="quantity" type="number" aria-label="Quantity"><label for="category">Category</label><select id="category" name="category"><option value="Food">Food</option></select><label for="bestBefore">Best-before date</label><input id="bestBefore" name="bestBefore" type="date"><button type="submit" onclick="event.preventDefault();addItem();">Add Item</button></form><div id="pantry"></div><script>
let items=JSON.parse(localStorage.getItem('items'))||[];function renderItem(item){const pantryDiv=document.getElementById('pantry');pantryDiv.innerHTML+='<div><span>'+item.ItemName+'</span><span>'+item.quantity+'</span></div>';}function addItem(event){const form=document.getElementById('addItemForm');items.push({ItemName:form.name.value,quantity:form.quantity.value});renderItem(items);}
</script></body>`;

async function main() {
  const html = ensureAddItemBehavior(source);
  const repair = html.slice(html.indexOf('function genosAddItemRepair'));
  assert.match(repair, /renderItem\(item\)/);
  assert.doesNotMatch(repair, /renderItem\(items\)/);
  assert.equal((ensureAddItemBehavior(html).match(/function genosAddItemRepair/g) || []).length, 1);
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByLabel('Item name').fill('Oats');
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    const state = await page.evaluate(() => ({ text: document.body.innerText, storage: localStorage.getItem('items') }));
    assert.equal(await page.getByText('Oats').count(), 1, JSON.stringify({ state, pageErrors }));
    assert.match(await page.locator('#pantry').innerText(), /Oats\s*2/);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('items')))[0].ItemName, 'Oats');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Add item renderer argument browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
