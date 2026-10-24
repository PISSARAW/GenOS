'use strict';

const assert = require('node:assert/strict');
const { repairPlan } = require('../src/services/workerCodeTestRepairRules');
const { ensurePantryHeading } = require('../src/services/workerCodePantryHeadingRepair');

const failure = { proposal: { tests: [{ stderr: "getByRole('heading', { name: /pantry/i }) to be visible at acceptance.cjs:13:52" }] } };
assert.deepEqual(repairPlan(failure), { kind: 'ensure_pantry_heading', label: 'Pantry Inventory' });
assert.match(ensurePantryHeading('<body><main>Items</main></body>'), /<h1>Pantry Inventory<\/h1>/);
assert.equal(ensurePantryHeading('<h1>Pantry</h1>'), '<h1>Pantry</h1>');
console.log('Pantry heading repair checks passed.');
