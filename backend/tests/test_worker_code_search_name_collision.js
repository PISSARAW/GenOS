'use strict';

const assert = require('node:assert/strict');
const { labelItemNameInput } = require('../src/services/workerCodeItemNameRepair');

const source = '<form><label for="itemName">Item name</label><input id="itemName">'
  + '<label for="search">Search</label><input id="search">'
  + '<button aria-label="Search" onclick="searchInventory()">Search</button></form>';
const repaired = labelItemNameInput(source, 'Item name');

assert.match(repaired, /<label for="search">Search<\/label><input id="search">/);
assert.match(repaired, /<button aria-label="Run search" onclick="searchInventory\(\)">Search<\/button>/);
assert.equal((repaired.match(/aria-label="Search"/g) || []).length, 0);
console.log('Search accessible-name collision checks passed.');
