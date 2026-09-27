'use strict';
const assert = require('assert');
const { bindPercepts, recurrentUpdate, bindingPermutation } = require('../src/services/perceptiveBindingService');
const first = bindPercepts({ items: [{ id: 'ball', features: { color: 'red' }, relation: 'left' }] });
const next = recurrentUpdate(first, { items: [{ id: 'ball', features: { color: 'red' }, relation: 'left', occluded: true }] });
assert.strictEqual(next.recurrence, true);
assert.strictEqual(next.bindings[0].id, 'ball');
assert.notStrictEqual(bindingPermutation(first)[0].id, first[0].id);
console.log('✅ perceptive binding tests passed');
