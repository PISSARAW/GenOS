'use strict';
const fs = require('node:fs');
const path = require('node:path');
const native = require('../../backend/src/services/agents/workerArtifactCodeProof');
const values = require('../../backend/src/services/trinityProvenanceValues');
const evaluate = require('./evaluate.cjs');
const { tree } = require('./io.cjs');
function gate(workspace, state) {
  const current = tree(workspace);
  const witnessed = state.tests.filter(test => test.workspaceHash === values.digest(current));
  const regression = witnessed.find(test => test.command === 'node regression.test.cjs' && test.exitCode === 0);
  const tests = regression ? [regression] : [];
  const content = { claims: [{ statement: 'Bug corrigé', evidence: tests.map(test => `genos://code-test/${values.digest(test)}`) }], tests };
  const codeProof = native.dossierCodeProofPresent(content, { executedTests: witnessed });
  const publicTests = ['smoke.test.cjs', 'invariants.test.cjs'].map(name => evaluate.test(workspace, name));
  const passed = codeProof && publicTests.every(test => test.exitCode === 0 && !test.timedOut);
  return { passed, codeProof, publicTests, workspaceHash: values.digest(current),
    reason: passed ? 'accepted' : 'Execute regression.test.cjs on this revision and satisfy the public contract.' };
}
function witnessedTest(workspace, name) {
  if (!['smoke.test.cjs', 'invariants.test.cjs', 'regression.test.cjs'].includes(name)) throw Error('TEST_NOT_ALLOWED');
  if (!fs.existsSync(path.join(workspace, name))) throw Error('TEST_MISSING');
  return { ...evaluate.test(workspace, name), workspaceHash: values.digest(tree(workspace)) };
}
module.exports = { gate, witnessedTest };
