'use strict';

const assert = require('node:assert/strict');
const { labelQuantityInput } = require('../src/services/workerCodeQuantityInputRepair');

const source = '<form><label for="quantity">Quantity</label><input type=\\"number\\" id=\\"quantity\\" aria-label=\\"Quantity\\"><input id="quantity" name="quantity" type="number" aria-label="Quantity"></form>';
const repaired = labelQuantityInput(source);
assert.equal((repaired.match(/aria-label="Quantity"/g) || []).length, 1);
assert.equal((repaired.match(/id="quantity"/g) || []).length, 1);
assert.match(repaired, /<form>[\s\S]*<\/form>/);
console.log('Quantity field de-duplication repair check passed.');
