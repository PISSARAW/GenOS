'use strict';
const assert = require('node:assert/strict');
const { total } = require('./totals.cjs');
const order = { member: false, items: [{ price: 10, quantity: 2 }] };
assert.equal(total(order), 20);
assert.equal(total({ ...order, member: true }), 18);
