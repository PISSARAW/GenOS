'use strict';

const values = require('../trinityProvenanceValues');
const journal = require('./nativeOracleJournal');
const proofs = require('./nativeOracleProof');
const provenance = require('../gvxMissionProvenance');
const { digest } = require('../biologicalIntegrity');

async function context(db, input) {
  const reference = input.event.payload?.nativeOracleRef;
  if (!reference) return null;
  const request = { runId: input.row.id, agentId: input.row.agent_id };
  const scope = await provenance.agentScope(db, request.agentId);
  const proof = await proofs.read(db, { ...request, scope, reference });
  await proofs.assertCurrent(db, { proof, request, report: input.event.payload.evidenceReport || input.event.payload.report });
  await assertNoncesUnused(db, proof.saved.evaluation.assembly.verifications);
  return { proof, gateContext: proofs.context(proof) };
}

async function assertNoncesUnused(db, receipts) {
  if (!await db.get("SELECT name FROM sqlite_master WHERE name='verifier_receipt_nonces'")) return;
  for (const receipt of receipts) {
    if (await db.get('SELECT nonce FROM verifier_receipt_nonces WHERE nonce=?', receipt.nonce)) throw values.failure('receipt_replay');
  }
}

async function accept(db, input) {
  if (!input.verification || !['completed', 'awaiting_approval'].includes(input.status)) return null;
  const proof = input.verification.proof;
  await proofs.assertCurrent(db, { proof, request: { runId: proof.attestation.value.runId,
    agentId: proof.attestation.value.agentId }, report: input.event.payload.evidenceReport || input.event.payload.report });
  const receipts = proof.saved.evaluation.assembly.verifications;
  for (const receipt of receipts) {
    const violation = await require('../strategyPromotionPolicyService').claimVerifierNonce(db, { independentVerifierReceipt: receipt });
    if (violation) throw values.failure(violation.policy);
  }
  const attested = proof.attestation.value;
  return journal.append(db, { kind: 'acceptance', scope: attested.scope,
    record: { schema: 'genos.native-oracle-acceptance/v1', runId: attested.runId, agentId: attested.agentId,
      scope: attested.scope, status: input.status, attestationHash: proof.attestation.hash,
      eventHash: digest(input.event), nonces: receipts.map(receipt => receipt.nonce),
      decidedAt: new Date().toISOString() } });
}

async function historical(db, input) {
  const reference = input.event.payload?.nativeOracleRef;
  if (!reference) return null;
  const header = await db.get(`SELECT organization_id AS organizationId, project_id AS projectId, entity_id AS entityId
    FROM gvx_development_events WHERE id=?`, journal.id(input.runId, 'acceptance'));
  if (!header) return null;
  const accepted = await journal.read(db, { ...input, kind: 'acceptance', scope: header });
  const proof = await proofs.read(db, { ...input, reference, scope: header, historical: true });
  assertAcceptance(accepted, proof);
  if (accepted.value.eventHash !== digest(input.event)) throw values.failure('ORACLE_DECISION_BINDING_MISMATCH');
  return { proof, acceptance: accepted, gateContext: proofs.context(proof) };
}

async function forPromotion(db, input) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='gvx_development_events'");
  if (table?.name !== 'gvx_development_events') return null;
  const header = await db.get(`SELECT organization_id AS organizationId, project_id AS projectId, entity_id AS entityId
    FROM gvx_development_events WHERE id=?`, journal.id(input.runId, 'acceptance'));
  if (!header) return null;
  const scope = await provenance.agentScope(db, input.agentId);
  if (!scope || values.digest(scope) !== values.digest(header)) throw values.failure('ORACLE_ATTESTATION_SCOPE_MISMATCH');
  const accepted = await journal.read(db, { ...input, scope, kind: 'acceptance' });
  if (!accepted) return null;
  if (accepted.value.status !== 'awaiting_approval') throw values.failure('ORACLE_PROMOTION_NOT_PENDING');
  const attestation = await journal.read(db, { ...input, scope, kind: 'attestation' });
  const reference = { hash: attestation.hash, eventId: attestation.eventId };
  const proof = await proofs.read(db, { ...input, reference, scope });
  await proofs.assertCurrent(db, { proof, request: input, report: input.report });
  assertAcceptance(accepted, proof);
  return { proof, acceptance: accepted, gateContext: proofs.context(proof) };
}

async function ownsNonce(db, input) {
  if (!input.receipt.executionEvidence?.some(item => item.subject?.runId)) return false;
  const selected = await forPromotion(db, input.promotion);
  if (!selected) throw values.failure('ORACLE_NONCE_OWNERSHIP_REQUIRED');
  const matching = selected.proof.saved.evaluation.assembly.verifications.find(item => item.nonce === input.receipt.nonce);
  if (!matching || values.digest(matching) !== values.digest(input.receipt)
      || !selected.acceptance.value.nonces.includes(matching.nonce)) throw values.failure('ORACLE_NONCE_OWNERSHIP_MISMATCH');
  if (!await db.get('SELECT nonce FROM verifier_receipt_nonces WHERE nonce=?', matching.nonce)) throw values.failure('ORACLE_NONCE_OWNERSHIP_MISMATCH');
  return true;
}

function assertAcceptance(accepted, proof) {
  const record = proof.attestation.value;
  const expected = { schema: 'genos.native-oracle-acceptance/v1', runId: record.runId, agentId: record.agentId,
    scope: record.scope, attestationHash: proof.attestation.hash,
    nonces: proof.saved.evaluation.assembly.verifications.map(item => item.nonce) };
  const metadata = Object.fromEntries(Object.keys(expected).map(key => [key, accepted.value[key]]));
  const decided = Date.parse(accepted.value.decidedAt);
  if (values.digest(metadata) !== values.digest(expected) || !Number.isFinite(decided)
      || decided < Date.parse(record.completedAt) || decided > Date.parse(record.validUntil)) throw values.failure('ORACLE_DECISION_BINDING_MISMATCH');
}

async function recordedReport(db, input) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='gvx_development_events'");
  if (table?.name !== 'gvx_development_events') return null;
  const scope = await provenance.agentScope(db, input.agentId);
  if (!scope) return null;
  const accepted = await journal.read(db, { ...input, scope, kind: 'acceptance' });
  return accepted ? journal.observationReport(db, input.runId) : null;
}

module.exports = { context, accept, historical, forPromotion, ownsNonce, recordedReport };
