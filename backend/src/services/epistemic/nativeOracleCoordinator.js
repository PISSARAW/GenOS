'use strict';

const { withTransaction } = require('../../db');
const values = require('../trinityProvenanceValues');
const authority = require('../missionEnvelopeAuthority');
const journal = require('./nativeOracleJournal');
const subjects = require('./oracleProcedureSubject');
const { keyFor, currentKeyId } = require('../epistemicReceiptKeyring');

async function prepare(db, request) {
  const saved = await authority.read(db, request.runId);
  if (!saved?.envelope.limits.verification) return null;
  try { keyFor(currentKeyId()); }
  catch { return null; }
  const allocation = await journal.reserve(db, request);
  if (!allocation.owned) {
    const prior = await journal.read(db, { ...request, scope: allocation.value.scope, kind: 'attestation' });
    if (!prior) throw values.failure('ORACLE_ALLOCATION_ALREADY_RESERVED');
    return { eventId: prior.eventId, hash: prior.hash };
  }
  return execute(db, { allocation, saved });
}

async function execute(db, context) {
  const { allocation, saved } = context;
  const request = { runId: allocation.value.runId, agentId: allocation.value.agentId, scope: allocation.value.scope };
  const antigen = require('./oracleProcedureClaim').build({ subject: allocation.subject, workspaceRoot: saved.envelope.workspaceRoot });
  const batch = await require('./verifierRuntimeBridge').executeVerifierWorkers(antigen,
    ['subset_bitset', 'subset_enumeration'].map(strategy => ({ type: 'procedure_semantic', strategy: [strategy] })),
    { db, nativeOracleSubject: request, nativeOracleAllocationHash: allocation.hash, nativeOracleDeadline: Date.parse(allocation.value.expiresAt),
      timeoutMs: allocation.value.limits.latencyMs, verifierBudget: { remaining: allocation.value.limits.executions } });
  const trusted = saved.envelope.scope;
  const registry = require('../verifierTrustRegistry');
  const assembly = require('./aeisPromotionBridge').buildAssuranceAssemblyFromHolobionte([antigen],
    [{ immune: { verifierResults: { results: batch.results } } }], { trustedVerifierDigests: registry.listVerifierDigests() });
  const evaluation = require('../epistemicAssuranceService').evaluateEpistemicAssurance(assembly);
  const accepted = evaluation.eligible && batch.results.every(result => result.status === 'verified');
  const assessed = { assembly, evaluation, allAccepted: accepted, anyBlocked: !accepted };
  return withTransaction(db, async () => {
    await authority.assertRun(db, request);
    const subject = await subjects.load(db, request);
    if (values.digest(subject) !== allocation.value.subjectHash) throw values.failure('ORACLE_SUBJECT_CHANGED');
    if (Date.now() > Date.parse(allocation.value.expiresAt)) throw values.failure('ORACLE_BUDGET_EXPIRED');
    const workspace = await db.get('SELECT workspace_id FROM agents WHERE id=?', request.agentId);
    const scopeId = [trusted.organizationId, trusted.projectId, workspace.workspace_id].join(':');
    const assemblyId = await require('../aeisAssemblyStore').saveAssembly(db, assessed, { runId: request.runId, scopeId });
    const record = { schema: 'genos.native-oracle-attestation/v1', ...request, allocationHash: allocation.hash,
      authorityHash: saved.hash, subjectHash: allocation.value.subjectHash, reportHash: allocation.value.reportHash,
      assemblyId, scopeId, accepted, costs: costs(batch), validUntil: new Date(Math.min(Date.parse(subject.validUntil),
        Date.parse(saved.envelope.expiresAt))).toISOString(), completedAt: new Date().toISOString() };
    const result = await journal.append(db, { kind: 'attestation', scope: trusted, record });
    return { eventId: result.eventId, hash: result.hash };
  });
}

function costs(batch) {
  const executions = batch.results.flatMap(result => result.receipt?.executionEvidence || []);
  return { processes: executions.length, runtimeMs: executions.reduce((total, item) => total + item.durationMs, 0),
    modelTokens: 0, providerUsd: 0, localComputeUsd: null };
}

module.exports = { prepare };
