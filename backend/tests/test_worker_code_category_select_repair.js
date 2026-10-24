'use strict';

const assert = require('node:assert/strict');
const { ensureUniqueCategorySelect } = require('../src/services/workerCodeCategorySelectRepair');
const { labelFilterSelect } = require('../src/services/workerCodeSelectRepair');

const source = '<form><select id="item-category" aria-label="Category"><option>Food</option></select></form>'
  + '<form><select id="category" name="category"><option>All</option><option>Food</option></select></form>';
const repaired = ensureUniqueCategorySelect(source);

assert.match(repaired, /<select id="item-category" aria-label="Category">/);
assert.match(repaired, /<select id="category" name="category" aria-label="Filter category">/);
assert.equal((repaired.match(/aria-label="Category"/g) || []).length, 1);
const fullyRepaired = labelFilterSelect(source, 'Filter category');
assert.equal((fullyRepaired.match(/aria-label="Category"/g) || []).length, 1);
assert.match(fullyRepaired, /aria-label="Filter category"/);
console.log('Category select disambiguation checks passed.');
