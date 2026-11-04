'use strict';
const crypto = require('node:crypto');
const TESTS = ['smoke.test.cjs', 'invariants.test.cjs'];
function hash(bytes) {return crypto.createHash('sha256').update(bytes).digest('hex');}
function assertContract(contract) {
  if (contract?.kind !== 'commonjs_public_tests' || contract.version !== 1) throw Error('COMMONJS_TEST_CONTRACT_INVALID');
  if (JSON.stringify(contract.tests) !== JSON.stringify(TESTS)) throw Error('COMMONJS_TEST_SET_INVALID');
  for (const test of TESTS) {
    const source = contract.sources.find(item => item.path === test);
    if (!source || source.mutable) throw Error('COMMONJS_TEST_SOURCE_UNSEALED');
  }
  assertPaths(contract.sources);
  return contract;
}
function assertPaths(sources) {
  for (const source of sources) {
    if (!/^[A-Za-z0-9_-]+(?:\.test)?\.cjs$/.test(source.path)) throw Error('COMMONJS_TEST_SOURCE_INVALID');
  }
}
function sourceMutable(contract, relative) {
  return contract.kind === 'commonjs_public_tests' && !relative.endsWith('.test.cjs');
}
function assertSources(subject) {
  assertContract(subject.contract);
  if (subject.sources.length !== subject.contract.sources.length) throw Error('COMMONJS_SOURCE_SET_CHANGED');
  for (const expected of subject.contract.sources) {
    const actual = subject.sources.find(item => item.path === expected.path);
    if (!actual || hash(actual.content) !== actual.sha256) throw Error('COMMONJS_SOURCE_HASH_CHANGED');
    if (!expected.mutable && actual.sha256 !== expected.sha256) throw Error('COMMONJS_PROTECTED_SOURCE_CHANGED');
  }
}
module.exports = {assertContract, assertSources, sourceMutable, TESTS};
