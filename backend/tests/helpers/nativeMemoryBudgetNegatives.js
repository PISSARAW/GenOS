'use strict';

const assert = require('node:assert/strict');
const journal = require('../../src/services/epistemic/nativeOracleJournal');
const contracts = require('../../src/services/strategyContractService');

async function qualify(db, context) {
  const { input, checked, dispatch } = context;
  await proofRefusals(db, checked);
  const saved = await contracts.getLatestContract(db, 'delegation-root');
  const tighter = structuredClone(saved.contract);
  tighter.promotion.native_verification.executions = 1;
  await contracts.saveContract(db, { agentId: 'delegation-root', workspaceId: 'delegation-ws', contract: tighter });
  const insufficient = await dispatch(db, input.method);
  assert.equal(insufficient.result.success, false);
  assert.equal(await journal.read(db, { ...insufficient.request, kind: 'reservation' }), null);
  assert.equal(await journal.read(db, { ...insufficient.request, kind: 'attestation' }), null);
  await contracts.saveContract(db, { agentId: 'delegation-root', workspaceId: 'delegation-ws', contract: saved.contract });
  await db.run('UPDATE genome_decisions SET content=? WHERE id=?', input.memory.content + '\nFalse claim.', input.memory.id);
  try {
    const refused = await dispatch(db, input.method);
    assert.equal(refused.row.status, 'blocked', JSON.stringify(refused));
    assert.equal(refused.row.guardrail_reason, 'ORACLE_ASSEMBLY_NOT_ACCEPTED');
    const proof = await journal.read(db, { ...refused.request, kind: 'attestation' });
    assert.equal(proof.value.accepted, false);
    assert.equal(proof.value.costs.processes, 2);
    assert.equal(await journal.read(db, { ...refused.request, kind: 'acceptance' }), null);
    const view = await require('../../src/services/consumerInspectionService').inspect(db,
      { runId: checked.row.id, scope: input.subject.binding.scope });
    assert.equal(view.nativeVerification.current.satisfied, false, 'the earlier decision cannot certify a changed memory');
  } finally { await db.run('UPDATE genome_decisions SET content=? WHERE id=?', input.memory.content, input.memory.id); }
  const sourceAssembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, input.subject.binding.assemblyId);
  await require('../../src/services/aeisAssemblyRetraction').retract(db, { assemblyId: input.subject.binding.assemblyId,
    scope: input.subject.binding.scope, expectedAssemblyHash: sourceAssembly.validity.assemblyHash,
    actorId: 'independent-test-human', rationale: 'Withdraw source assurance in the native budget probe.' });
  const withdrawn = await dispatch(db, input.method);
  assert.equal(withdrawn.result.success, false);
  assert.equal(await journal.read(db, { ...withdrawn.request, kind: 'reservation' }), null);
  const view = await require('../../src/services/consumerInspectionService').inspect(db,
    { runId: checked.row.id, scope: input.subject.binding.scope });
  assert.equal(view.nativeVerification.current.reason, 'AEIS_ASSEMBLY_RETRACTED');
  console.log('Native memory budget negatives: insufficient grant, contradictory memory, historical freshness and retracted source refused.');
}

module.exports = { qualify };

async function proofRefusals(db, checked) {
  const attested = await journal.read(db, { ...checked.request, kind: 'attestation' });
  const proof = await require('../../src/services/epistemic/nativeOracleProof').read(db, {
    ...checked.request, reference: { hash: attested.hash, eventId: attested.eventId } });
  const report = await journal.observationReport(db, checked.row.id);
  const changed = structuredClone(report);
  changed.workerArtifact.content.verdict = 'reject';
  const proofs = require('../../src/services/epistemic/nativeOracleProof');
  await assert.rejects(proofs.assertCurrent(db, { proof, request: checked.request, report: changed }),
    { code: 'ORACLE_COMPLETION_RESULT_CHANGED' });
  const subject = await require('../../src/services/epistemic/oracleMemoryRuntimeSubject').load(db, checked.request);
  const falseVerdict = { ...subject.content, verification: { ...subject.content.verification, verdict: 'reject' } };
  for (const strategy of ['memory_rendered', 'memory_parsed']) {
    const probe = await require('../../src/services/epistemic/oracleNativeProcess').run(falseVerdict, { kind: 'memory', strategy, timeoutMs: 10000 });
    assert.equal(probe.result.status, 'refuted', 'fresh oracle rejects a verdict that contradicts a faithful memory');
  }
  const clock = Date.now;
  Date.now = () => Date.parse(checked.authority.envelope.expiresAt) + 1;
  try { await assert.rejects(proofs.assertCurrent(db, { proof, request: checked.request, report }), { code: 'EXECUTION_AUTHORITY_EXPIRED' }); }
  finally { Date.now = clock; }
}
