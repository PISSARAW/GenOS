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
const addOnly = '<form><label for="category">Category</label><select id="category"><option value="Food">Food</option></select></form>';
const withMissingFilter = labelFilterSelect(addOnly, 'Filter category');
assert.match(withMissingFilter, /<select id="category"[^>]*>/);
assert.match(withMissingFilter, /<select id="filterCategory" aria-label="Filter category"><option value="all">All<\/option><option value="Food">Food<\/option><\/select>/);
assert.match(withMissingFilter, /<\/form><label for="filterCategory">Filter category<\/label>/);
console.log('Category select disambiguation checks passed.');
