'use strict';

const validation = require('./morphogenesis/learning/outcomeEvidenceValidation');
const terminalOutcome = require('./terminalOutcomeEvidence');

const TERMINAL_EVENTS = new Set(['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR',
  'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN']);
const ORACLE_QUALITY_SCHEMA = 'genos.native-oracle-quality-evidence/v1';

async function attach(db, input) {
  const { agentId, event } = input;
  if (!isTargetEvent(event)) return event;
  const scope = await runScope(db, agentId);
  if (!isWorkerScope(scope)) return markUnavailable(event, 'worker_scope_required');
  const prior = await replayExisting(db, event);
  if (prior) return prior;
  return attachWorkerOutcome(db, { agentId, event, scope });
}

async function replayExisting(db, event) {
  const runId = event.payload.executionRunId;
  const eventKey = String(event.id || event.eventId || '');
  if (!eventKey) return null;
  const store = require('./biologicalWorkerStore');
  await store.ensure(db);
  const row = await store.observation(db, { runId, eventKey });
  if (!row) return null;
  const prior = store.verifiedJson(row, 'event_json');
  return require('./biologicalIntegrity').digest(stripDerivedFields(prior))
      === require('./biologicalIntegrity').digest(stripDerivedFields(event)) ? prior : null;
}

function stripDerivedFields(event) {
  const payload = { ...event.payload };
  delete payload.qualityEvidence;
  delete payload.qualityEvidenceStatus;
  delete payload.negativeOutcomeEvidenceStatus;
  return { ...event, payload };
}

function isTargetEvent(event) {
  return TERMINAL_EVENTS.has(event?.eventType) && Boolean(event.payload?.executionRunId);
}

function isWorkerScope(scope) {
  return Boolean(scope && scope.executionMode === 'worker');
}

function terminalPayload(event) {
  const payload = { ...event.payload };
  delete payload.qualityEvidence;
  delete payload.negativeOutcomeEvidence;
  payload.qualityEvidenceStatus = unavailableStatus(event.eventType);
  if (terminalOutcome.FAILURE_EVENTS.has(event.eventType)) {
    payload.negativeOutcomeEvidenceStatus = { status: 'unavailable', reason: 'signed_negative_outcome_evidence_required' };
  }
  return payload;
}

async function attachWorkerOutcome(db, input) {
  const { agentId, event, scope } = input;
  const payload = terminalPayload(event);
  if (!scope.valid) return withUnavailable(payload, 'agent_scope_unavailable', event);
  if (event.eventType !== 'AGENT_COMPLETED') return attachNegativeOutcome({ agentId, event, payload, scope });
  try {
    return await attachAcceptedOracle(db, { agentId, event, payload, scope });
  } catch (failure) {
    return withUnavailable(payload, failure.code || 'independent_oracle_unavailable', event);
  }
}

function attachNegativeOutcome(input) {
  const { agentId, event, payload, scope } = input;
  const evidence = event.payload?.negativeOutcomeEvidence;
  const binding = bindingOf(event, agentId, scope);
  if (!terminalOutcome.validateNegativeOutcome({ event, evidence, binding })) {
    return { ...event, payload };
  }
  payload.negativeOutcomeEvidence = evidence;
  payload.negativeOutcomeEvidenceStatus = { status: 'verified', schema: terminalOutcome.NEGATIVE_OUTCOME_SCHEMA,
    receiptId: evidence.receiptId };
  return { ...event, payload };
}

function bindingOf(event, agentId, scope) {
  return { actionId: event.payload.executionRunId, agentId,
    organizationId: scope.organizationId, projectId: scope.projectId };
}

function markUnavailable(event, reason) {
  const payload = { ...event.payload };
  delete payload.qualityEvidence;
  delete payload.negativeOutcomeEvidence;
  payload.qualityEvidenceStatus = { status: 'unavailable', reason };
  if (terminalOutcome.FAILURE_EVENTS.has(event.eventType)) {
    payload.negativeOutcomeEvidenceStatus = { status: 'unavailable', reason };
  }
  return { ...event, payload };
}

async function attachAcceptedOracle(db, input) {
  const { agentId, event, payload, scope } = input;
  const row = { id: payload.executionRunId, agent_id: agentId };
  const verification = await require('./epistemic/nativeOracleGate').context(db, { row, event: { ...event, payload } });
  const proof = verification?.proof;
  if (!acceptedProof(proof)) return { ...event, payload };
  const qualityEvidence = issueQualityEvidence({ proof, runId: row.id, agentId, scope });
  if (!validation.validate(qualityEvidence, binding(row.id, agentId, scope))) {
    return withUnavailable(payload, 'quality_receipt_validation_failed', event);
  }
  payload.qualityEvidence = qualityEvidence;
  payload.qualityEvidenceStatus = { status: 'verified', schema: ORACLE_QUALITY_SCHEMA,
    receiptId: qualityEvidence.receiptId };
  return { ...event, payload };
}

function unavailableStatus(eventType) {
  const reason = eventType === 'WORKER_NO_ANSWER_PROVEN' || eventType === 'MISSION_NO_ANSWER_PROVEN'
    ? 'no_answer_has_no_quality_score' : 'terminal_outcome_not_independently_accepted';
  return { status: 'unavailable', reason };
}

function withUnavailable(payload, reason, event) {
  const next = { ...payload, qualityEvidenceStatus: { status: 'unavailable', reason } };
  if (terminalOutcome.FAILURE_EVENTS.has(event.eventType)) {
    next.negativeOutcomeEvidenceStatus = { status: 'unavailable', reason };
  }
  return { ...event, payload: next };
}

function acceptedProof(proof) {
  const evaluation = proof?.saved?.evaluation;
  const receipts = evaluation?.assembly?.verifications;
  return proof?.attestation?.hash && evaluation?.allAccepted === true
    && Array.isArray(receipts) && receipts.length >= 2
    && receipts.every(item => item.status === 'verified' && item.independent === true && item.signature);
}

async function runScope(db, agentId) {
  const row = await db.get(`SELECT a.execution_mode AS executionMode,
    w.organization_id AS organizationId, w.project_id AS projectId
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, agentId);
  if (!row) return null;
  return { executionMode: row.executionMode, organizationId: row.organizationId || null,
    projectId: row.projectId || null,
    valid: Boolean(row.organizationId) === Boolean(row.projectId) };
}

function binding(actionId, agentId, scope) {
  return { actionId, agentId, organizationId: scope.organizationId, projectId: scope.projectId };
}

function issueQualityEvidence(input) {
  const { proof, runId, agentId, scope } = input;
  const receiptId = `native-oracle-quality:${proof.attestation.hash}`;
  const fields = { status: 'VERIFIED', kind: 'oracle', receiptId, success: true, value: 1,
    ...binding(runId, agentId, scope) };
  const sourceReceipts = proof.saved.evaluation.assembly.verifications;
  const sourceReceiptRefs = sourceReceipts.map(item => ({ resultId: item.receipt?.resultId || item.resultId,
    nonce: item.receipt?.nonce, signature: item.receipt?.signature, verifierDigest: item.verifierDigest }))
    .sort((left, right) => String(left.nonce).localeCompare(String(right.nonce)));
  const executionEvidence = [{ schema: ORACLE_QUALITY_SCHEMA, runId, attestationHash: proof.attestation.hash,
    attestationEventId: proof.attestation.eventId, sourceReceiptRefs }];
  const evidenceDigest = validation.evidenceDigest(fields);
  const verifierDigest = require('./verifierTrustRegistry').ensureVerifier('native_oracle_quality').digest;
  const receipt = require('./epistemicVerifierReceiptService').issueReceipt({ resultId: receiptId, evidenceDigest,
    verifierDigest, checkedAt: proof.attestation.value?.completedAt, nonce: receiptId,
    independent: true, status: 'verified', executionEvidence });
  return { ...fields, receipt };
}

module.exports = { attach, acceptedProof, issueQualityEvidence, ORACLE_QUALITY_SCHEMA };
