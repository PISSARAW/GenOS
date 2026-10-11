'use strict';

const values = require('../trinityProvenanceValues');
const authority = require('../missionEnvelopeAuthority');
const provenance = require('../gvxMissionProvenance');
const journal = require('./nativeOracleJournal');
const proofs = require('./nativeOracleProof');

async function context(db, input) {
  const report = input.event.payload?.evidenceReport || input.event.payload?.report;
  const references = report?.delegatedOracleRefs;
  if (!Array.isArray(references) || !references.length) return null;
  assertReportShape(report);
  const parent = await authority.assertRun(db, { agentId: input.row.agent_id, runId: input.row.id });
  if (parent.status !== 'authorized') throw values.failure('DELEGATED_ORACLE_PARENT_AUTHORITY_REQUIRED');
  const verified = await Promise.all(references.map((reference) => verifyReference(db, {
    input, parentEnvelope: parent.envelope, reference
  })));
  assertClaims(report, verified);
  const gateContext = proofs.context(verified[0].proof);
  return { proof: verified[0].proof, delegated: true, gateContext };
}

function assertReportShape(report) {
  if (report.outcome !== 'success' || !Array.isArray(report.claims) || !report.claims.length
      || (report.unverifiedClaims || []).length || (report.contradictions || []).length || (report.omissions || []).length) {
    throw values.failure('DELEGATED_ORACLE_REPORT_INCOMPLETE');
  }
}

async function verifyReference(db, { input, parentEnvelope, reference }) {
  assertReferenceShape(reference);
  const scope = await childScope(db, { reference, parentId: input.row.agent_id, parentScope: parentEnvelope.scope });
  const request = { runId: reference.runId, agentId: reference.agentId, scope };
  const childAuthority = await authority.assertRun(db, request);
  assertChildMission(childAuthority, parentEnvelope);
  const proof = await proofs.read(db, { ...request, reference: reference.reference });
  const childReport = await journal.observationReport(db, reference.runId);
  await proofs.assertCurrent(db, { proof, request, report: childReport });
  await assertAccepted(db, { reference, proof, scope });
  return { workerId: reference.agentId, report: childReport, proof };
}

function assertReferenceShape(reference) {
  if (!reference || !reference.agentId || !reference.runId || !reference.reference) {
    throw values.failure('DELEGATED_ORACLE_REFERENCE_INVALID');
  }
}

async function childScope(db, { reference, parentId, parentScope }) {
  const child = await db.get('SELECT parent_agent_id FROM agents WHERE id = ?', reference.agentId);
  if (child?.parent_agent_id !== parentId) throw values.failure('DELEGATED_ORACLE_PARENT_MISMATCH');
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id = ? AND agent_id = ?', reference.runId, reference.agentId);
  if (run?.status !== 'completed') throw values.failure('DELEGATED_ORACLE_RUN_INCOMPLETE');
  const scope = await provenance.agentScope(db, reference.agentId);
  if (!scope?.organizationId || scope.organizationId !== parentScope.organizationId
      || scope.projectId !== parentScope.projectId) throw values.failure('DELEGATED_ORACLE_SCOPE_MISMATCH');
  return scope;
}

function assertChildMission(childAuthority, parentEnvelope) {
  if (childAuthority.status !== 'authorized' || childAuthority.envelope.missionId !== parentEnvelope.missionId) {
    throw values.failure('DELEGATED_ORACLE_MISSION_MISMATCH');
  }
}

async function assertAccepted(db, { reference, proof, scope }) {
  const accepted = await journal.read(db, { runId: reference.runId, kind: 'acceptance', scope });
  const record = accepted?.value;
  const nonces = proof.saved.evaluation.assembly.verifications.map((item) => item.nonce);
  if (!record || record.status !== 'completed' || record.attestationHash !== proof.attestation.hash
      || values.digest(record.nonces) !== values.digest(nonces)) {
    throw values.failure('DELEGATED_ORACLE_NOT_ACCEPTED');
  }
}

function claimKey(claim) {
  return JSON.stringify({ statement: String(claim.statement || ''), evidence: claim.evidence || [] });
}

function assertClaims(report, verified) {
  const sourceByWorker = new Map(verified.map((item) => [item.workerId, item.report.claims || []]));
  const finalByWorker = new Map();
  for (const claim of report.claims) {
    if (!sourceByWorker.has(claim.workerId)) throw values.failure('DELEGATED_ORACLE_CLAIM_SOURCE_UNKNOWN');
    const list = finalByWorker.get(claim.workerId) || [];
    list.push(claim);
    finalByWorker.set(claim.workerId, list);
  }
  if (finalByWorker.size !== sourceByWorker.size) throw values.failure('DELEGATED_ORACLE_CLAIM_SET_MISMATCH');
  for (const [workerId, sourceClaims] of sourceByWorker) {
    const finalClaims = finalByWorker.get(workerId) || [];
    const source = sourceClaims.map(claimKey).sort();
    const final = finalClaims.map(claimKey).sort();
    if (values.digest(source) !== values.digest(final)) throw values.failure('DELEGATED_ORACLE_CLAIM_SET_MISMATCH');
  }
}

module.exports = { context, assertClaims };
