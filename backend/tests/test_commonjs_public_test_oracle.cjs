'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const contracts = require('../src/services/epistemic/workspaceVerificationContract');
const checks = require('../src/services/epistemic/oracleWorkspaceChecks');
const hash = value => createHash('sha256').update(value).digest('hex');

function subject(code) {
  const files = {'increment.cjs': code,
    'smoke.test.cjs': "require('node:assert/strict').equal(require('./increment.cjs').increment(1),2);",
    'invariants.test.cjs': "require('node:assert/strict').equal(require('./increment.cjs').increment(-1),0);"};
  const sources = Object.entries(files).map(([path, content]) => ({path, content, sha256: hash(content)}));
  return {contract: {version: 1, kind: 'commonjs_public_tests', tests: ['smoke.test.cjs', 'invariants.test.cjs'],
    sources: sources.map(({path, sha256}) => ({path, sha256, mutable: !path.endsWith('.test.cjs')}))}, sources};
}

function main() {
  const good = subject('exports.increment=x=>x+1;');
  contracts.assertContract(good.contract);
  for (const strategy of ['source_recompute', 'cross_check']) {
    const passed = checks.checkWorkspace(good, strategy);
    assert.equal(passed.status, 'verified'); assert.equal(passed.nestedProcesses, 2);
    assert.equal(checks.checkWorkspace(subject('exports.increment=x=>x-1;'), strategy).status, 'refuted');
  }
  const forged = structuredClone(good);
  forged.sources[1].content = '';
  assert.equal(checks.checkWorkspace(forged, 'source_recompute').status, 'inconclusive');
  const writable = structuredClone(good.contract); writable.sources[1].mutable = true;
  assert.throws(() => contracts.assertContract(writable));
  const escaped = structuredClone(good.contract); escaped.sources[0].path = '../increment.cjs';
  assert.throws(() => contracts.assertContract(escaped));
  assert.equal(checks.checkWorkspace(subject('process.exit(0);'), 'source_recompute').status, 'refuted');
  console.log('Native public-test oracle: executed true/false postconditions, nested process counts, immutable hashes and path confinement PASS');
}
main();
