'use strict';

const { digest } = require('../../relationalPhysiology');
const policy = require('./teamRelationalPolicy');
const projection = require('./handoffProjection');
const store = require('./handoffAdmissionStore');
const { messageDigest } = require('./handoffAdmissionService');
const { consumption } = require('./workerHandoffAdmission');

async function verifyEdge(db, input) {
  const edge = input.edge, handoff = edge.handoff;
  if (!edge.accepted || !handoff?.validation?.passed) throw policy.fail('ATEAM_RPE_ACK_REQUIRED');
  const binding = await require('../../biologicalWorkerStore').latestBindingForMission(db,
    { missionId: input.run.execution.runtimeMissionId, workerId: handoff.consumer.agentId });
  if (!binding) throw policy.fail('ATEAM_RPE_RECEIVER_RUN_REQUIRED');
  const rows = await db.all(`SELECT c.body_json FROM ateam_relational_consumptions c
    JOIN ateam_relational_admissions a ON a.receipt_id=c.receipt_id
    WHERE a.team_run_id=? AND a.handoff_id=? AND a.handoff_digest=? AND c.consumer_run_id=?`,
  input.run.teamRunId, handoff.handoffId, handoff.digest, binding.runId);
  if (rows.length !== 1) throw policy.fail('ATEAM_RPE_CONSUMPTION_REQUIRED');
  const consumed = consumption(rows[0]), admission = await store.readRef(db, consumed.receiptId);
  await verifyBinding(db, { ...input, binding, consumed, admission });
  return { handoffId: handoff.handoffId, receiptId: admission.receiptId,
    consumerRunId: binding.runId, semanticAckObserved: true,
    consumerEvidenceRefs: handoff.validation.consumerEvidenceRefs };
}

async function verifyBinding(db, input) {
  const { run, edge, binding, admission, consumed } = input;
  if (admission.messageDigest !== messageDigest(edge.handoff)
    || consumed.messageDigest !== admission.messageDigest || admission.status !== 'admitted'
    || admission.missionId !== run.execution.runtimeMissionId) throw policy.fail('ATEAM_RPE_RECEIPT_SCOPE_MISMATCH');
  const now = Date.now();
  const actual = await projection.load(db, { run, scope: admission.context.scope, now, expiresAt: now + 60000 });
  if (actual.policyHash !== admission.policyHash) throw policy.fail('ATEAM_RPE_ADMISSION_STALE');
  const current = await require('../../missionEnvelopeAuthority').assertRun(db,
    { agentId: admission.consumerId, runId: binding.runId });
  const sealedAt = Date.parse(current.envelope.issuedAt);
  if (sealedAt < admission.admittedAt || sealedAt >= admission.expiresAt) throw policy.fail('ATEAM_RPE_AUTHORITY_EXPIRED');
  await require('../../missionEnvelopeAuthority').assertCompletedRunEvidence(db,
    { agentId: admission.consumerId, runId: binding.runId });
  const turns = await db.all('SELECT request_json FROM organism_model_turns WHERE agent_id=?', admission.consumerId);
  if (!turns.some(turn => turn.request_json.includes(admission.receiptId))) {
    throw policy.fail('ATEAM_RPE_CONTEXT_NOT_CONSUMED');
  }
}

async function qualify(db, input) {
  if (!policy.required(input.run)) return { required: false, passed: true };
  try {
    if (input.observed.graph.teamRunId !== input.run.teamRunId) throw policy.fail('ATEAM_RPE_GRAPH_SCOPE_MISMATCH');
    await store.ensure(db);
    const records = [];
    for (const edge of input.observed.graph.edges.filter(e => e.blocking !== false)) {
      records.push(await verifyEdge(db, { run: input.run, edge }));
    }
    return { required: true, passed: true, records, receiptDigest: digest(records) };
  } catch (error) {
    return { required: true, passed: false, reason: error.code || error.message };
  }
}

module.exports = { qualify, verifyEdge };
