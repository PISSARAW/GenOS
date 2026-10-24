'use strict';

const assert = require('node:assert/strict');
const { ensureUniqueCategorySelect, ensureAccessibleCategorySelect } = require('../src/services/workerCodeCategorySelectRepair');
const { labelFilterSelect } = require('../src/services/workerCodeSelectRepair');
const { repairPlan, applyRepairPlan } = require('../src/services/workerCodeTestRepair');

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
const addFormWithoutSelect = '<form><input id="item-name"><button type="submit">Add Item</button></form>';
const withCategory = ensureAccessibleCategorySelect(addFormWithoutSelect);
assert.match(withCategory, /<label for="category">Category<\/label><select id="category" name="category" aria-label="Category">/);
assert.match(withCategory, /<option value="Household">Household<\/option>/);
const categoryFailure = { proposal: { tests: [{ stderr: 'getByLabel(/^category$/i) timeout' }] } };
const categoryPlan = repairPlan(categoryFailure);
const categoryProposal = JSON.stringify({ patches: [{ path: 'index.html', content: addFormWithoutSelect }] });
const repairedCategory = JSON.parse(applyRepairPlan(categoryProposal, categoryPlan)).patches[0].content;
assert.match(repairedCategory, /<select id="category" name="category" aria-label="Category">/);
const buttonCollision = '<form><label for="category">Category</label><select id="category"><option>Food</option></select></form>'
  + '<button id="filterCategory">Filter category: All</button><script>document.getElementById("filterCategory").addEventListener("click", filter);</script>';
const repairedButtonCollision = labelFilterSelect(buttonCollision, 'Filter category');
assert.equal((repairedButtonCollision.match(/\bid="filterCategory"/g) || []).length, 1);
assert.match(repairedButtonCollision, /<button id="filterCategoryAction">Filter category: All<\/button>/);
assert.match(repairedButtonCollision, /getElementById\("filterCategoryAction"\)/);
assert.match(repairedButtonCollision, /<select id="filterCategory" aria-label="Filter category">/);
console.log('Category select disambiguation checks passed.');
