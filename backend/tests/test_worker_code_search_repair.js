'use strict';

const assert = require('node:assert/strict');
const { repairPlan, applyRepairPlan } = require('../src/services/workerCodeTestRepair');
const error = { proposal: { tests: [{ stderr: 'getByLabel(/search/i) timed out' }] } };
const plan = repairPlan(error);
const source = '<form><label for="item-name">Item name</label><input id="item-name" aria-label="Item name"><select id="filter-category" aria-label="Filter category"></select></form>';
const proposal = JSON.stringify({ patches: [{ path: 'index.html', content: source }] });
const repaired = JSON.parse(applyRepairPlan(proposal, plan)).patches[0].content;
assert.match(repaired, /<input id="item-name" aria-label="Item name">/);
assert.match(repaired, /<input type="search" id="search" name="search" aria-label="Search">/);
console.log('Missing Search repair preserves the Item name control.');
