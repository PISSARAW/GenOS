'use strict';

const assert = require('node:assert/strict');
const { labelFilterSelect } = require('../src/services/workerCodeSelectRepair');

const source = '<form id="addForm"><select id="category"><option value="Food">Food</option></select></form>'
  + '<form id="filterForm" style="display: none;"><label for="filterCategory">Filter Category</label>'
  + '<select id="filterCategory" hidden style="visibility: hidden"><option value="Food">Food</option></select></form>';
const repaired = labelFilterSelect(source, 'Filter category');

assert.doesNotMatch(repaired, /<form[^>]*style="display: none;/i);
assert.doesNotMatch(repaired, /<select[^>]*\bhidden\b/i);
assert.doesNotMatch(repaired, /<select[^>]*style="visibility: hidden/i);
assert.match(repaired, /<select id="filterCategory" aria-label="Filter category">/);
console.log('Select visibility repair checks passed.');
