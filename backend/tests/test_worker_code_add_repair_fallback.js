'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { ensureAddItemBehavior } = require('../src/services/workerCodeAddRepair');

const rendererSource = '<!doctype html><h1>Pantry</h1><form><label for="itemName">Item name</label><input id="itemName"><label for="quantity">Quantity</label><input id="quantity" type="number"><label for="category">Category</label><select id="category"><option value="Food">Food</option></select><label for="bestBeforeDate">Best-before date</label><input id="bestBeforeDate" type="date"><button type="submit">Add Item</button></form><div id="pantry"></div><script>let pantryItems=[];function renderPantry(){document.getElementById("pantry").innerHTML=pantryItems.map(item=>"<p>"+item.name+": "+item.quantity+"</p>").join("")}</script>';

async function main() {
  const source = '<!doctype html><h1>Pantry</h1><form><label for="item-name">Item name</label><input id="item-name"><label for="quantity">Quantity</label><input id="quantity" type="number"><label for="category">Category</label><select id="category"><option value="Food">Food</option></select><label for="bestBeforeDate">Best-before date</label><input id="bestBeforeDate" type="date"><button type="submit">Add Item</button></form><table id="pantry-table"><tbody></tbody></table><script>function addItem(){throw new Error("broken candidate renderer")}</script>';
  const html = ensureAddItemBehavior(source);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(request.url === '/renderer' ? ensureAddItemBehavior(rendererSource) : html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByLabel('Item name').fill('Oats');
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    assert.equal(await page.getByText('Oats', { exact: true }).count(), 1);
    assert.equal(await page.locator('tbody tr').count(), 1);
    assert.match(await page.locator('tbody tr').innerText(), /Oats\s+2/);
    await page.getByRole('button', { name: 'Increase quantity for Oats' }).click();
    assert.match(await page.locator('tbody tr').innerText(), /Oats\s+3/);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('pantry')))[0].quantity, 3);
    await page.goto(`http://127.0.0.1:${server.address().port}/renderer`);
    await page.getByLabel('Item name').fill('Oats');
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    assert.equal(await page.getByText(/Oats: 2/).count(), 1);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Add item fallback browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
