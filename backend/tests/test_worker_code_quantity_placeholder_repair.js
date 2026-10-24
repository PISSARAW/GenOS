'use strict';

const assert = require('node:assert/strict');
const { ensureQuantityIncrementBehavior } = require('../src/services/workerCodeQuantityIncrementRepair');

const source = '<div class="item"><span>Name</span><input id="quantity" type="number">'
  + '<button type="button" aria-label="Increase quantity for Name">+</button></div>';
const repaired = ensureQuantityIncrementBehavior(source);

assert.doesNotMatch(repaired, /aria-label="Increase quantity for Name"/);
assert.match(repaired, /setAttribute\('aria-label','Increase quantity for '\+name\)/);
console.log('Placeholder quantity action repair checks passed.');
