'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const values = require('../../src/services/trinityProvenanceValues');
const journal = require('../../src/services/epistemic/nativeOracleJournal');

async function candidate(context, expression) {
  await fs.writeFile(path.join(context.workspace, 'src/answer.gexpr'), expression);
  context.method.parameters.expectedContentHash = values.hashBytes(Buffer.from(expression));
}

async function refutation(db, context) {
  await candidate(context, 'a % b');
  const worker = require('../../src/services/agents/workerCodeVerification');
  const original = worker.runCode;
  worker.runCode = async (...args) => {
    const result = await original(...args);
    result.evidenceReport.workerArtifact.content.verdict = 'accept';
    return result;
  };
  let checked;
  try { checked = await require('../test_native_code_completion').dispatch(db, context.method); }
  finally { worker.runCode = original; }
  const proof = await assertRefused(db, checked);
  const saved = await require('../../src/services/aeisAssemblyStore').readAssembly(db, proof.value.assemblyId);
  for (const receipt of saved.evaluation.assembly.verifications) {
    assert.equal(receipt.status, 'refuted');
    const observation = receipt.executionEvidence[0];
    assert.equal(observation.exitCode, 0, 'a successful process is not a successful code postcondition');
    assert.ok(observation.postconditions.counterexample.actual < 0);
    assert.equal(observation.postconditions.reason, 'code_postcondition_false');
  }
  console.log('Code false-success probe: zero exits and forged accept verdict refused by both real postcondition oracles.');
}

async function unsupported(db, context) {
  await candidate(context, 'process.exit(0)');
  const checked = await require('../test_native_code_completion').dispatch(db, context.method);
  const proof = await assertRefused(db, checked);
  const saved = await require('../../src/services/aeisAssemblyStore').readAssembly(db, proof.value.assemblyId);
  for (const receipt of saved.evaluation.assembly.verifications) {
    assert.equal(receipt.status, 'inconclusive');
    assert.equal(receipt.executionEvidence[0].postconditions.reason, 'code_language_outside_domain');
  }
  console.log('Unsupported program remains inconclusive and never becomes a generic JavaScript execution.');
}

async function assertRefused(db, checked) {
  assert.equal(checked.row.status, 'blocked', JSON.stringify(checked));
  assert.equal(checked.row.guardrail_reason, 'ORACLE_ASSEMBLY_NOT_ACCEPTED');
  const proof = await journal.read(db, { ...checked.request, kind: 'attestation' });
  assert.equal(proof.value.accepted, false);
  assert.equal(proof.value.costs.processes, 2);
  assert.equal(proof.value.costs.complete, true);
  assert.equal(await journal.read(db, { ...checked.request, kind: 'acceptance' }), null);
  const receipt = await require('../../src/services/biologicalWorkerStore').receipt(db, checked.row.id);
  assert.equal(receipt.result.verified, false);
  assert.deepEqual(receipt.oracleExecution.costs, proof.value.costs);
  return proof;
}

async function changed(db, context) {
  const executor = require('../../src/services/epistemic/oracleNativeProcess');
  const original = executor.run;
  let injected = false;
  executor.run = async (subject, options) => {
    const result = await original(subject, options);
    if (!injected && options.kind === 'code') {
      const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, subject.runId);
      await fs.writeFile(path.join(authority.envelope.workspaceRoot, subject.artifact.path), 'a % b');
      injected = true;
    }
    return result;
  };
  let checked;
  try { checked = await require('../test_native_code_completion').dispatch(db, context.method); }
  finally { executor.run = original; }
  assert.equal(injected, true);
  const view = await require('../../src/services/epistemic/nativeOracleInspection').inspect(db, checked.request);
  assert.equal(view.status, 'aborted');
  assert.equal(view.reason, 'CODE_ORACLE_CONTENT_HASH_MISMATCH');
  assert.equal(view.costs.processes, 1);
  assert.equal(await journal.read(db, { ...checked.request, kind: 'acceptance' }), null);
  const receipt = await require('../../src/services/biologicalWorkerStore').receipt(db, checked.row.id);
  assert.equal(receipt.result.verified, false);
  assert.deepEqual(receipt.oracleExecution.costs, view.costs);
  console.log('Real post-process code change refused without losing its observed cost.');
}

module.exports = { refutation, unsupported, changed };
