'use strict';

const assert = require('node:assert/strict');
const trinity = require('../src/services/trinityService');
const balance = require('../src/services/trinityBalancePuzzleVerifier');
const missions = require('../src/services/trinityMissionVerifierService');

const leaf = (coin, direction) => ({ result: { coin, direction } });
const node = (left, right, branches) => ({ weighing: { left, right }, branches });

function canonicalTree() {
  const h1 = node([1, 2, 5], [3, 6, 9], {
    left_heavy: node([1], [2], { left_heavy: leaf(1, 'heavy'), right_heavy: leaf(2, 'heavy'), balance: leaf(6, 'light') }),
    right_heavy: node([3], [9], { left_heavy: leaf(3, 'heavy'), right_heavy: leaf(5, 'light'), balance: leaf(5, 'light') }),
    balance: node([7], [8], { left_heavy: leaf(8, 'light'), right_heavy: leaf(7, 'light'), balance: leaf(4, 'heavy') })
  });
  const h2 = node([1, 2, 5], [3, 6, 9], {
    left_heavy: node([3], [9], { left_heavy: leaf(5, 'heavy'), right_heavy: leaf(3, 'light'), balance: leaf(5, 'heavy') }),
    right_heavy: node([1], [2], { left_heavy: leaf(2, 'light'), right_heavy: leaf(1, 'light'), balance: leaf(6, 'heavy') }),
    balance: node([7], [8], { left_heavy: leaf(7, 'heavy'), right_heavy: leaf(8, 'heavy'), balance: leaf(4, 'light') })
  });
  const balanced = node([9, 10, 11], [1, 2, 3], {
    left_heavy: node([9], [10], { left_heavy: leaf(9, 'heavy'), right_heavy: leaf(10, 'heavy'), balance: leaf(11, 'heavy') }),
    right_heavy: node([9], [10], { left_heavy: leaf(10, 'light'), right_heavy: leaf(9, 'light'), balance: leaf(11, 'light') }),
    balance: node([12], [1], { left_heavy: leaf(12, 'heavy'), right_heavy: leaf(12, 'light'), balance: leaf(12, 'heavy') })
  });
  return node([1, 2, 3, 4], [5, 6, 7, 8], { left_heavy: h1, right_heavy: h2, balance: balanced });
}

function testBalanceVerifier() {
  const tree = canonicalTree();
  assert.deepEqual(balance.verify(tree), { verified: true, covered: 24, total: 24, counterexample: null });
  const falseTree = node([1, 2, 3, 4], [5, 6, 7, 8], { left_heavy: leaf(1, 'heavy'), right_heavy: leaf(5, 'heavy'), balance: leaf(9, 'heavy') });
  assert.equal(balance.verify(falseTree).verified, false);
}

function testMissionContracts() {
  const plan = trinity.analyzeMission('Lance Trinity: les lenteurs 2–4 s, verrou, GC et réseau.');
  assert.equal(plan.domain, 'performance_diagnosis');
  assert.match(plan.members[0].hypothesis, /discriminating measurement/i);
  const puzzle = trinity.analyzeMission('Lance Trinity: 12 pièces, trois pesées.');
  assert.equal(puzzle.domain, 'combinatorial_algorithm');
  assert.match(puzzle.members[0].hypothesis, /artifact\.weighingTree/);
}

function testMissionProofAttachment() {
  const reports = missions.verifyMissionReports([{ worldNumber: 2, report: { artifact: { weighingTree: canonicalTree() }, budgetStatus: 'within' } }], '12 pièces, trois pesées');
  const report = reports[0].report;
  assert.equal(report.missionContractVerification.status, 'verified');
  assert.equal(report.evidenceVector.coverage, 1);
  assert.equal(report.claims[0].verificationLevel, 'independent_deterministic');
}

testBalanceVerifier();
testMissionContracts();
testMissionProofAttachment();
process.stdout.write('Trinity mission verifier tests passed.\n');
