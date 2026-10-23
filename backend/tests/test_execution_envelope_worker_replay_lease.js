'use strict';

const assert = require('node:assert/strict');
const { toolLease } = require('../src/services/executionEnvelopeContract');

const worker = { workerContract: { identity: { workerKind: 'scout_cell' }, authority: { execute: true } } };
assert.deepEqual(toolLease(worker), ['genos_replay']);
assert.deepEqual(toolLease({ ...worker, deniedTools: ['genos_replay'] }), [],
  'an explicit worker denial must override the capsule replay capability');
assert.deepEqual(toolLease({ workerContract: { identity: { workerKind: 'scout_cell' }, authority: { execute: false } } }), [],
  'a worker without execution authority must not receive the capsule replay capability');
assert.deepEqual(toolLease({ toolLease: ['genos_snapshot'] }), ['genos_snapshot'],
  'non-worker tool leases must remain unchanged');
process.stdout.write('Execution envelope grants replay only to executable workers and honors explicit denials: PASS\n');
