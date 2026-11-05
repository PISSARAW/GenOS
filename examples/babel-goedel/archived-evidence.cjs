'use strict';

const assert = require('node:assert/strict');
const reader = require('../../backend/src/services/topology/workerResultReader.cjs');
const values = require('../../backend/src/services/trinityProvenanceValues');
const domains = require('../../backend/src/services/epistemic/nativeOracleDomains');

async function load(db, input) {
  const records = [];
  for (const member of input.members) {
    const saved = await reader.readEvidence(db, { missionId: input.missionId, member,
      executionRunId: member.executionRunId });
    assert.equal(saved.valid, true);
    const receipt = saved.receipt;
    assert.equal(receipt.result.verified, true);
    assert.equal(receipt.result.status, 'completed');
    assert.equal(receipt.budgetAssessment.satisfied, true);
    const request = { runId: receipt.runId, agentId: member.workerId, event: saved.event.event };
    const verification = await require('../../backend/src/services/epistemic/nativeOracleGate').historical(db, request);
    require('../../backend/src/services/aeisAssemblyRetraction').assertActive(verification.proof.saved.validity);
    assert.equal(verification.acceptance.hash, receipt.semanticVerification.acceptanceHash);
    assert.equal(verification.proof.attestation.hash, receipt.semanticVerification.hash);
    await assertSealedCompletion(db, { request, receipt, proof: verification.proof });
    records.push({ binding: saved.binding, receipt, role: member.role });
  }
  return records;
}

async function assertSealedCompletion(db, input) {
  const { request, receipt, proof } = input;
  const saved = await require('../../backend/src/services/missionEnvelopeAuthority').read(db, request.runId);
  const attestation = proof.attestation.value;
  assert.equal(saved.hash, attestation.authorityHash);
  assert.equal(saved.envelope.scope.entityId, request.agentId);
  assert.equal(saved.envelope.missionId, receipt.missionId);
  const run = await db.get('SELECT status,completed_at FROM strategy_execution_runs WHERE id=? AND agent_id=?',
    request.runId, request.agentId);
  assert.equal(run.status, 'completed');
  const terminalAt = Date.parse(request.event.timestamp);
  const completedAt = Math.max(Date.parse(run.completed_at), terminalAt);
  assert.ok(Number.isFinite(completedAt));
  assert.ok(Math.abs(Date.parse(run.completed_at) - terminalAt) <= 60000);
  assert.ok(completedAt <= Date.parse(saved.envelope.expiresAt));
  assert.ok(completedAt <= Date.parse(attestation.validUntil));
  const subject = await domains.load(db, { ...request, scope: attestation.scope, completedEvidence: true });
  assert.equal(values.digest(subject), attestation.subjectHash);
  assert.equal(values.digest(receipt.evidence.report), attestation.reportHash);
  const formal = proof.saved.evaluation.assembly.results[0];
  const domain = domains.definition(subject.domain);
  domain.subject.assertAntigen({ id: formal.resultId, formalResult: formal, claim: formal.canonicalStatement,
    epitopes: { evidence: { digest: formal.evidence.digest } },
    producer: domain.claim.build({ subject, workspaceRoot: saved.envelope.workspaceRoot }).producer }, subject);
}

module.exports = { load };
