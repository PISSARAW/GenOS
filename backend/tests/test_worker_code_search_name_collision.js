'use strict';

const assert = require('node:assert/strict');
const { labelItemNameInput } = require('../src/services/workerCodeItemNameRepair');
const { labelFilterSelect } = require('../src/services/workerCodeSelectRepair');

const source = '<form><label for="itemName">Item name</label><input id="itemName">'
  + '<label for="search">Search</label><input id="search">'
  + '<button aria-label="Search" onclick="searchInventory()">Search</button></form>';
const repaired = labelItemNameInput(source, 'Item name');

assert.match(repaired, /<label for="search">Search<\/label><input id="search">/);
assert.match(repaired, /<button aria-label="Run search" onclick="searchInventory\(\)">Search<\/button>/);
assert.equal((repaired.match(/aria-label="Search"/g) || []).length, 0);
const headings = labelItemNameInput('<h1>Pantry Inventory</h1><h2>Pantry Items</h2><form><input id="itemName"></form>', 'Item name');
assert.match(headings, /<h1>Pantry Inventory<\/h1><h2>Items<\/h2>/);
const broadSearch = labelItemNameInput('<div aria-label="Filter and Search"><input id="search" aria-label="Search"><button aria-label="Filter/Search">Filter/Search</button></div><form><input id="itemName"></form>', 'Item name');
assert.doesNotMatch(broadSearch, /aria-label="Filter and Search"/);
assert.match(broadSearch, /aria-label="Apply filters"/);
const withFilterRepair = labelFilterSelect(source + '<select id="filter"><option>All</option></select>', 'Filter category');
assert.match(withFilterRepair, /<button aria-label="Run search" onclick="searchInventory\(\)">Search<\/button>/);
console.log('Search accessible-name collision checks passed.');
