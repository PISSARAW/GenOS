'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { ensureAddItemBehavior } = require('../src/services/workerCodeAddRepair');
const { ensureQuantityIncrementBehavior } = require('../src/services/workerCodeQuantityIncrementRepair');
const { removeQuantityCollisionsAfterReload } = require('../src/services/workerCodeQuantityRepair');
const { repairPlan } = require('../src/services/workerCodeTestRepairRules');

const rendererSource = '<!doctype html><h1>Pantry</h1><form><label for="itemName">Item name</label><input id="itemName"><label for="quantity">Quantity</label><input id="quantity" type="number"><label for="category">Category</label><select id="category"><option value="Food">Food</option></select><label for="bestBeforeDate">Best-before date</label><input id="bestBeforeDate" type="date"><button type="submit">Add Item</button></form><div id="pantry"></div><script>let pantryItems=[];function renderPantry(){document.getElementById("pantry").innerHTML=pantryItems.map(item=>"<p>"+item.name+": "+item.quantity+"</p>").join("")}</script>';
const searchNameCollisionSource = '<!doctype html><h1>Pantry</h1><form><input type="search" id="name" aria-label="Search"><label for="itemName">Item name</label><input id="itemName"><label for="quantity">Quantity</label><input id="quantity" type="number"><label for="category">Category</label><select id="category"><option value="Food">Food</option></select><label for="bestBeforeDate">Best-before date</label><input id="bestBeforeDate" type="date"><button type="submit">Add Item</button></form><table id="pantry-table"><tbody></tbody></table><script>let pantry=[]</script>';
const inventoryContainerSource = '<!doctype html><h1>Pantry</h1><form><label for="item-name">Item name</label><input id="item-name"><label for="quantity">Quantity</label><input id="quantity" type="number"><label for="category">Category</label><select id="category"><option value="Food">Food</option></select><label for="best-before">Best-before date</label><input id="best-before" type="date"><button type="submit">Add Item</button></form><div id="inventory"></div><script>let pantry=[]</script>';
const deleteRowSource = '<!doctype html><form><label for="item-name">Item name</label><input id="item-name"><label for="quantity">Quantity</label><input id="quantity" type="number"><select id="category"><option value="Food">Food</option></select><input id="bestBeforeDate" type="date"><button type="submit">Add Item</button></form><div id="pantry"><div class="item"><span class="itemName">Oats</span><span>3</span><button type="button" onclick="deleteItem(this)">Delete</button></div></div><script>function deleteItem(button){button.closest(".item").remove();localStorage.setItem("pantry",JSON.stringify([]));}</script>';

assert.deepEqual(repairPlan({ proposal: { tests: [{ stderr: "locator.click: Timeout 4000ms exceeded while waiting for getByRole('button', { name: /delete oats/i }) at tests/acceptance.cjs:35:56" }] } }),
  { kind: 'ensure_add_item_behavior', label: 'Add Item' });

async function main() {
  const source = '<!doctype html><h1>Pantry</h1><form><label for="item-name">Item name</label><input id="item-name"><label for="quantity">Quantity</label><input id="quantity" type="number"><label for="category">Category</label><select id="category"><option value="Food">Food</option></select><label for="bestBeforeDate">Best-before date</label><input id="bestBeforeDate" type="date"><button type="submit">Add Item</button></form><table id="pantry-table"><tbody></tbody></table><script>function addItem(){throw new Error("broken candidate renderer")}</script>';
  const repair = (candidate) => removeQuantityCollisionsAfterReload(
    ensureQuantityIncrementBehavior(ensureAddItemBehavior(candidate)));
  const html = repair(source);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(request.url === '/renderer' ? repair(rendererSource)
      : request.url === '/delete' ? repair(deleteRowSource)
        : request.url === '/search-name' ? repair(searchNameCollisionSource)
          : request.url === '/inventory' ? repair(inventoryContainerSource) : html);
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
    await page.reload();
    assert.equal(await page.getByLabel('Quantity', { exact: true }).count(), 1);

    await page.goto(`http://127.0.0.1:${server.address().port}/search-name`);
    await page.getByLabel('Item name').fill('Oats');
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    assert.equal(await page.locator('#pantry-table tbody tr').count(), 1);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('pantry')))[0].name, 'Oats');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`http://127.0.0.1:${server.address().port}/inventory`);
    await page.getByLabel('Item name').fill('Oats');
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    assert.equal(await page.locator('#inventory .item').count(), 1);
    await page.goto(`http://127.0.0.1:${server.address().port}/renderer`);
    await page.getByLabel('Item name').fill('Oats');
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add Item' }).click();
    assert.equal(await page.getByText(/Oats: 2/).count(), 1);
    const deletePage = await browser.newPage();
    await deletePage.addInitScript(() => localStorage.setItem('pantry', JSON.stringify([{ itemName: 'Oats', quantity: 3 }])));
    await deletePage.goto(`http://127.0.0.1:${server.address().port}/delete`);
    assert.ok(await deletePage.getByRole('button', { name: 'Delete Oats' }).count() >= 1);
    await deletePage.getByRole('button', { name: 'Delete Oats' }).first().click();
    assert.equal(await deletePage.getByText('Oats').count(), 0);
    assert.deepEqual(JSON.parse(await deletePage.evaluate(() => localStorage.getItem('pantry'))), []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().then(() => console.log('Add item fallback browser check passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
