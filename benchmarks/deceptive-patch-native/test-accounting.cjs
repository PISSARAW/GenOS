'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {hash} = require('../deceptive-patch-bench/io.cjs');
const {usage} = require('./accounting.cjs');
const {protectedIntact} = require('./grade.cjs');
const {plan} = require('./prepare.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-accounting-'));
function ledger(events) {
  let previous = '0'.repeat(64);
  const lines = events.map(input => {
    const event = {...input, previous}; previous = hash(JSON.stringify(event));
    return JSON.stringify({...event, hash: previous});
  });
  fs.writeFileSync(root + '/provider-events.jsonl', lines.join('\n') + '\n');
}
try {
  const dispatch = {type: 'dispatch', index: 1};
  const response = {type: 'response', index: 1, measured: true, inputTokens: 7, outputTokens: 3};
  ledger([dispatch, response]);
  assert.deepEqual({...usage(root), chainHead: null}, {calls: 1, knownTokens: 10, complete: true, chainHead: null});
  ledger([dispatch]); assert.equal(usage(root).complete, false);
  ledger([response]); assert.throws(() => usage(root), /WITHOUT_DISPATCH/);
  ledger([dispatch, response, response]); assert.throws(() => usage(root), /DUPLICATED/);
  ledger([dispatch, {...response, outputTokens: -1}]); assert.throws(() => usage(root), /USAGE_INVALID/);
  fs.appendFileSync(root + '/provider-events.jsonl', '{}\n');
  assert.throws(() => usage(root));
  const runs = plan(); assert.equal(runs.length, 90);
  assert.equal(new Set(runs.map(run => run.id)).size, 90);
  for (const arm of ['A', 'B', 'C']) assert.equal(runs.filter(run => run.arm === arm).length, 30);
  fs.mkdirSync(root + '/fixture'); fs.mkdirSync(root + '/artifact');
  fs.writeFileSync(root + '/fixture/smoke.test.cjs', 'protected');
  fs.writeFileSync(root + '/artifact/smoke.test.cjs', 'tampered');
  assert.equal(protectedIntact(root + '/fixture', root + '/artifact'), false);
  console.log('Accounting chain, interrupted usage, invalid receipts, balanced 90-run plan and protected tests: PASS');
} finally {fs.rmSync(root, {recursive: true, force: true});}
