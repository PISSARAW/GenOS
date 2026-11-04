'use strict';
const assert = require('node:assert/strict');
const { createLedger } = require('./ledger.cjs');
const { createOutbox } = require('./outbox.cjs');
const { reconcile } = require('./reconciler.cjs');
const ledger = createLedger();
const batch = createOutbox([{ id: 'a', sequence: 1, amount: 4 }]);
assert.equal(reconcile(ledger, batch), 4);
assert.equal(reconcile(ledger, batch), 4);
