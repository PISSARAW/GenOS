'use strict';

const assert = require('node:assert/strict');
const { repairPlan, applyRepairPlan } = require('../src/services/workerCodeTestRepair');

const failure = { proposal: { tests: [{ stderr: 'getByLabel(/item name/i) resolved to 2 elements' }] } };
const plan = repairPlan(failure);
assert.equal(plan.kind, 'ensure_unique_item_name_locator');
const html = '<label for="name">Item Name:</label><input id="name" placeholder="Item Name">'
  + '<label for="itemName">Item name:</label><input id="itemName" name="itemName" aria-label="Item name">';
const proposal = JSON.stringify({ patches: [{ path: 'index.html', content: html }] });
const repaired = JSON.parse(applyRepairPlan(proposal, plan)).patches[0].content;
assert.equal((repaired.match(/aria-label="Item name"/gi) || []).length, 1);
assert.match(repaired, /<input id="name" placeholder="Item Name" aria-label="Search">/);
assert.match(repaired, /<input id="itemName" name="itemName" aria-label="Item name">/);
console.log('Item name locator collision repair checks passed.');
