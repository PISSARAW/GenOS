'use strict';

const assert = require('node:assert/strict');
const { evaluateMorphogenesis } = require('./morphogenesis-oracle.cjs');

function transition(id) {
  return { id, journaled: true, identityPreserved: true, validRelationsPreserved: true,
    permissionsPreserved: true, provenancePreserved: true, collaborationReceipt: true };
}

function run() {
  assert.equal(evaluateMorphogenesis({ transitions: [transition('one')] }).status, 'inconclusive');
  const evidence = { transitions: [transition('one'), transition('two')], criticalViolations: 0 };
  assert.equal(evaluateMorphogenesis(evidence).status, 'pass');
  const unsafe = { ...evidence, transitions: [transition('one'), { ...transition('two'), permissionsPreserved: false }] };
  assert.equal(evaluateMorphogenesis(unsafe).status, 'fail');
  assert.equal(evaluateMorphogenesis({ ...evidence, criticalViolations: 1 }).status, 'fail');
}

run();
process.stdout.write('SocialWorld V2 morphogenesis oracle tests passed\n');
