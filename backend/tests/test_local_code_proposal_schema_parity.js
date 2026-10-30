'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { parseProposal, proposalResponseFormat } = require('../src/services/localCodeWorkerService');
const validate = new Ajv({ strict: false }).compile(proposalResponseFormat().schema);
const base = { format: 'genos.file-replacement/v1', patches: [{ path: 'answer.py', content: 'value = 42' }],
  tests: ['pytest'], evidence: 'fixture' };
const cases = [base,
  { ...base, patches: [] },
  { ...base, patches: [{ path: 'answer.py', content: 'value = 42', edits: [{ find: '0', replace: '42' }] }] },
  { ...base, patches: [{ path: 'answer.py', edits: [{ find: '', replace: '42' }] }] },
  { ...base, patches: [{ path: 'answer.py', edits: [{ find: '0', replace: '42' }] }] },
  { ...base, tests: [42] }];
for (const value of cases) {
  let parsed = true;
  try { parseProposal(JSON.stringify(value)); } catch { parsed = false; }
  assert.equal(validate(value), parsed, JSON.stringify({ value, errors: validate.errors }));
}
const full = new Ajv({ strict: false }).compile(proposalResponseFormat({ forceFullFileReplacement: true }).schema);
assert.equal(full(base), true);
assert.equal(full(cases[4]), false);
console.log('Local code proposal schema/parser parity: PASS');
