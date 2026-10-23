'use strict';

const assert = require('node:assert/strict');
const { applyRepairPlan } = require('../src/services/workerCodeTestRepair');

const content = '<form><label for="bestBeforeDate" aria-label="Best-before date">Best-before date</label><input id="bestBeforeDate" type="date" aria-label="Best-before date"></form>';
const proposal = JSON.stringify({ patches: [{ path: 'index.html', content }] });
const plan = { kind: 'ensure_best_before_input_label', label: 'Best-before date' };
const repaired = JSON.parse(applyRepairPlan(proposal, plan)).patches[0].content;
assert.doesNotMatch(repaired, /<label[^>]*aria-label=/i);
assert.match(repaired, /<input[^>]*aria-label="Best-before date"/i);
const nestedProposal = JSON.stringify({ patches: [{ path: 'index.html', content:
  '<label for="bestBeforeDate" aria-label="Best-before date"><input id="bestBeforeDate" type="date"></label>'
}] });
const repairedNested = JSON.parse(applyRepairPlan(nestedProposal, plan)).patches[0].content;
assert.doesNotMatch(repairedNested, /<label[^>]*aria-label=/i);
assert.match(repairedNested, /<input id="bestBeforeDate" type="date" aria-label="Best-before date">/i);
console.log('Best-before accessible label de-duplication check passed.');
