'use strict';

const assert = require('node:assert/strict');
const { fixture, subject, CANDIDATE, BASELINE, hash } = require('./helpers/repairObligationFixture');
const { checkWorkspace, STRATEGIES } = require('../src/services/epistemic/oracleWorkspaceChecks');
const contracts = require('../src/services/epistemic/workspaceVerificationContract');
const repair = require('../src/services/epistemic/repairObligationContract');
const receipts = require('../src/services/epistemic/repairObligationReceiptBinding');

function check(value, expected) {
  let last;
  for (const strategy of STRATEGIES) {
    last = checkWorkspace(subject(value), strategy);
    assert.equal(last.status, expected, JSON.stringify(last));
  }
  return last;
}

function reseal(value, name, content) {
  value.files[name] = content;
  value.contract.sources.find(source => source.path === name).sha256 = hash(content);
}

function positive() {
  const value = fixture();
  const result = check(value, 'verified');
  const coverage = result.coverage;
  assert.equal(coverage.complete, true);
  assert.equal(coverage.scope, 'declared_finite_cases');
  assert.equal(coverage.artifactContentHash, hash(CANDIDATE));
  assert.equal(coverage.baselineContentHash, hash(BASELINE));
  assert.equal(coverage.checkedMutants, 2);
  assert.deepEqual(coverage.obligations.map(item => item.baselineFailures), [2, 0]);
  coverage.obligations.forEach(item => {
    assert.equal(item.checkedCases, 2);
    assert.equal(item.candidateFailures, 0);
    assert.deepEqual(item.killedMutantIds, ['constant-zero', 'wrong-boundary']);
  });
  receipts.assert({ postconditions: result }, { content: subject(value) });
}

function falseClaims() {
  for (const expression of [BASELINE, '0', 'a + b', '1 / 0']) {
    const value = fixture();
    value.files['candidate.gexpr'] = expression;
    const result = check(value, 'refuted');
    assert.equal(result.reason, 'repair_candidate_postcondition_false');
    assert.ok(result.coverage.obligations.some(item => item.counterexample));
  }
  const unsupported = fixture();
  unsupported.files['candidate.gexpr'] = 'require("node:fs").writeFileSync("should-not-exist", "bad")';
  check(unsupported, 'inconclusive');
}

function inadequateTests() {
  const cases = [
    value => reseal(value, 'baseline.gexpr', CANDIDATE),
    value => { value.contract.mutants[0].expression = CANDIDATE; },
    value => { value.contract.mutants[0].expression = '1 / 0'; },
    value => { value.suite.obligations[0].cases = [{ input: { a: 5, b: 4 }, expected: 1 }];
      reseal(value, 'obligations.json', JSON.stringify(value.suite)); },
    value => { value.suite.obligations[1].cases = [{ input: { a: -1, b: 4 }, expected: 3 }];
      reseal(value, 'obligations.json', JSON.stringify(value.suite)); }
  ];
  cases.forEach(mutate => { const value = fixture(); mutate(value); check(value, 'inconclusive'); });
}

function invalidContracts() {
  const changes = [
    value => { value.contract.obligationIds.push('uncovered'); },
    value => { value.contract.mutants[0].obligationIds = ['unknown']; },
    value => { value.contract.mutants[1].id = value.contract.mutants[0].id; },
    value => { value.contract.baselinePath = value.contract.artifactPath; },
    value => { value.contract.sources[1].mutable = true; },
    value => { value.contract.sources[2].mutable = 'false'; },
    value => { value.contract.suitePath = '../outside.json'; },
    value => { value.contract.mutants = []; },
    value => { value.contract.obligationIds[0] = ' negative'; }
  ];
  changes.forEach(mutate => {
    const value = fixture(); mutate(value);
    assert.throws(() => contracts.assertContract(value.contract));
    check(value, 'inconclusive');
  });
}

function invalidSuites() {
  const changes = [
    suite => { suite.obligations.pop(); },
    suite => { suite.obligations[1].id = 'negative'; },
    suite => { suite.obligations[0].mode = 'preservation'; },
    suite => { suite.obligations[0].cases[0].expected = '3'; },
    suite => { suite.obligations[0].cases[0].input.a = 1e7; },
    suite => { suite.obligations[0].cases[0].input.c = 1; },
    suite => { suite.obligations[0].cases.push(suite.obligations[0].cases[0]); },
    suite => { suite.obligations[0].cases = []; },
    suite => { suite.obligations[0].cases = Array.from({ length: 129 }, (_, a) => ({ input: { a, b: 1 }, expected: 0 })); }
  ];
  changes.forEach(mutate => {
    const value = fixture(); mutate(value.suite);
    reseal(value, 'obligations.json', JSON.stringify(value.suite));
    check(value, 'inconclusive');
  });
  const altered = fixture();
  altered.files['obligations.json'] = '{}';
  check(altered, 'inconclusive');
  assert.throws(() => repair.load({ ...subject(), sources: [] }));
}

function receiptTampering() {
  const value = fixture();
  const result = check(value, 'verified');
  const changes = [
    coverage => { coverage.artifactContentHash = 'a'.repeat(64); },
    coverage => { coverage.suiteContentHash = 'a'.repeat(64); },
    coverage => { coverage.contractHash = 'a'.repeat(64); },
    coverage => { coverage.complete = false; },
    coverage => { coverage.obligations.pop(); },
    coverage => { coverage.obligations[0].checkedCases = 1; },
    coverage => { coverage.obligations[0].baselineFailures = 0; },
    coverage => { coverage.obligations[1].baselineFailures = 1; },
    coverage => { coverage.obligations[0].killedMutantIds.pop(); },
    coverage => { coverage.checkedMutants = 1; }
  ];
  changes.forEach(mutate => {
    const changed = structuredClone(result); mutate(changed.coverage);
    assert.throws(() => receipts.assert({ postconditions: changed }, { content: subject(value) }),
      { code: 'REPAIR_OBLIGATION_RECEIPT_BINDING_MISMATCH' });
  });
}

function maximumCoverage() {
  const value = fixture();
  value.suite.obligations = Array.from({ length: 16 }, (_, index) => ({
    ...value.suite.obligations[0], id: `${index}`.padEnd(64, 'o'), statement: 's'.repeat(512),
    cases: Array.from({ length: 8 }, (_, a) => ({ input: { a: -1 - a * 4, b: 4 }, expected: 3 }))
  }));
  value.contract.obligationIds = value.suite.obligations.map(item => item.id);
  value.contract.mutants = Array.from({ length: 16 }, (_, index) => ({
    id: `${index}`.padEnd(64, 'm'), expression: '0',
    obligationIds: [value.contract.obligationIds[index], value.contract.obligationIds[(index + 1) % 16]]
  }));
  reseal(value, 'obligations.json', JSON.stringify(value.suite));
  const result = check(value, 'verified');
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 16384, 'maximum coverage must fit the native output limit');
  receipts.assert({ postconditions: result }, { content: subject(value) });
  value.contract.mutants[0].obligationIds.push(value.contract.obligationIds[2]);
  assert.throws(() => contracts.assertContract(value.contract));
}

positive();
falseClaims();
inadequateTests();
invalidContracts();
invalidSuites();
receiptTampering();
maximumCoverage();
console.log('AEIS repair: sealed obligations, differential baseline, targeted mutants, bounded failures and receipt binding: PASS');
