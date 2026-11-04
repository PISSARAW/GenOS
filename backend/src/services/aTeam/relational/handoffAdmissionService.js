'use strict';

const { withTransaction } = require('../../../db');
const { digest } = require('../../relationalPhysiology');
const { runGuarded } = require('../../relationalPhysiology/runtimeBoundary');
const policy = require('./teamRelationalPolicy');
const projection = require('./handoffProjection');
const store = require('./handoffAdmissionStore');

function messageDigest(handoff) {
  const value = { ...handoff };
  for (const key of ['status', 'validation', 'relationalReceiptRef']) delete value[key];
  return digest(value);
}

async function authority(db, input) {
  const run = await require('../teamRunStore').load(db, input.teamRunId);
  require('../execution/teamExecutionService').assertLease(run, input.runnerToken);
  const missionId = run.execution.runtimeMissionId;
  const mission = await require('../../missionIdentityService').get(db, missionId);
  if (mission?.status !== 'active' || mission.orchestratorAgentId !== run.missionId) {
    throw policy.fail('ATEAM_RPE_MISSION_AUTHORITY_REQUIRED');
  }
  await require('../../missionExecutionAuthority').assertAgentCurrent(db, run.missionId);
  const lease = await require('../../missionEnvelopeAuthorityState').lease(db, missionId);
  if (lease?.agentId !== run.missionId) throw policy.fail('ATEAM_RPE_MISSION_AUTHORITY_REQUIRED');
  const owner = await require('../../gvxMissionProvenance').requireAgentScope(db, run.missionId);
  const scope = { organizationId: owner.organizationId, projectId: owner.projectId };
  return { run, scope, missionId, authorityHash: digest(lease) };
}

async function canonical(db, input) {
  const graph = await require('../workGraph/workGraphStore').load(db, input.run.workGraphId);
  if (graph?.teamRunId !== input.run.teamRunId) throw policy.fail('ATEAM_RPE_GRAPH_SCOPE_MISMATCH');
  const edge = graph.edges.find(e => e.handoff?.handoffId === input.handoff.handoffId);
  if (!edge?.available || messageDigest(edge.handoff) !== messageDigest(input.handoff)) {
    throw policy.fail('ATEAM_RPE_HANDOFF_CHANGED');
  }
  const producer = input.run.members.find(m => m.workerId === input.handoff.producer.agentId);
  const consumer = input.run.members.find(m => m.workerId === input.handoff.consumer.agentId);
  if (!producer || consumer?.workerId !== input.workerId) throw policy.fail('ATEAM_RPE_MEMBER_SCOPE_MISMATCH');
  const binding = await require('../../biologicalWorkerStore').latestBindingForMission(db,
    { missionId: input.missionId, workerId: producer.workerId });
  if (!binding) throw policy.fail('ATEAM_RPE_PRODUCER_EVIDENCE_REQUIRED');
  await require('../../missionEnvelopeAuthority').assertCompletedRunEvidence(db,
    { agentId: producer.workerId, runId: binding.runId });
  const prior = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', consumer.workerId);
  return { producer, consumer, sourceRunId: binding.runId, edgeId: edge.edgeId,
    dispatchEpoch: prior?.id || 'initial' };
}

function requestFor(input, snapshot) {
  const handoff = input.handoff;
  return { kind: 'communicate', scope: input.scope, actorId: input.run.missionId,
    receiverId: handoff.consumer.agentId,
    operationId: `ateam-rpe:${digest([input.run.teamRunId, handoff.handoffId, handoff.digest]).slice(0, 48)}`,
    expectedRevision: snapshot.context.revision, event: 'information',
    blind: projection.blind(snapshot.context, [handoff.producer.agentId, handoff.consumer.agentId], input.now),
    refs: projection.refs(handoff) };
}

function grant(request, context) {
  return { allowed: true, operationId: request.operationId, actorId: request.actorId,
    requestHash: digest(request), validUntil: context.validUntil,
    recipientIds: [request.receiverId], readableRefIds: request.refs.map(ref => ref.id),
    requiredAck: 'action_ack' };
}

function identity(input) {
  return { teamRunId: input.run.teamRunId, handoffId: input.handoff.handoffId,
    handoffDigest: input.handoff.digest, dispatchEpoch: input.parties.dispatchEpoch };
}

function assertPrior(receipt, input) {
  if (receipt.messageDigest !== messageDigest(input.handoff)
    || receipt.policyHash !== input.snapshot.policyHash
    || receipt.authorityHash !== input.authorityHash
    || receipt.consumerId !== input.workerId || Date.now() >= receipt.expiresAt) {
    throw policy.fail('ATEAM_RPE_ADMISSION_STALE');
  }
  if (receipt.status !== 'admitted') throw policy.fail('ATEAM_RPE_HANDOFF_DENIED');
  return receipt;
}

function receiptBody(input, decision) {
  const full = decision.permitted && decision.plan.redactedRefIds.length === 0;
  return { schema: 'genos.ateam-rpe-admission/v1',
    ...identity(input), receiptId: `rpe-${digest(identity(input))}`,
    missionId: input.missionId, producerId: input.parties.producer.workerId,
    consumerId: input.workerId, sourceRunId: input.parties.sourceRunId,
    actorId: input.run.missionId, authorityHash: input.authorityHash,
    messageDigest: messageDigest(input.handoff), policyHash: input.snapshot.policyHash,
    context: input.snapshot.context, request: { ...input.request, at: input.now }, decision,
    status: full ? 'admitted' : 'denied', admittedAt: input.now, expiresAt: input.expiresAt,
    acknowledgment: 'required_from_native_consumer', semanticAccepted: false };
}

async function evaluate(db, input) {
  const prior = await store.read(db, identity(input));
  if (prior) return assertPrior(prior, input);
  let receipt;
  const result = await runGuarded(input.request, {
    withBoundary: async (_operation, task) => task(), now: () => input.now,
    loadContext: async () => input.snapshot.context,
    authorize: async (request, context) => grant(request, context),
    recordDecision: async decision => { receipt = await store.put(db, receiptBody(input, decision)); },
    execute: async () => ({ admitted: receipt.status === 'admitted', deliveryClaimed: false })
  });
  return { ...receipt, nativeBoundaryStatus: result.status };
}

async function admitOne(db, input) {
  const parties = await canonical(db, input);
  const now = Date.now();
  const expiresAt = Math.min(Date.parse(input.run.execution.runnerLease.expiresAt),
    Date.parse(input.run.execution.deadlineAt));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw policy.fail('ATEAM_RPE_AUTHORITY_EXPIRED');
  const snapshot = await projection.load(db, { ...input, now, expiresAt });
  const request = requestFor({ ...input, now }, snapshot);
  return evaluate(db, { ...input, now, expiresAt, snapshot, request, parties });
}

async function admitHandoffs(input) {
  const initial = await require('../teamRunStore').load(input.db, input.teamRunId);
  if (!policy.required(initial)) return input.handoffs;
  const records = await withTransaction(input.db, async tx => {
    const auth = await authority(tx, input);
    const results = [];
    for (const handoff of input.handoffs) {
      results.push(await admitOne(tx, { ...auth, handoff, workerId: input.member.workerId }));
    }
    return results;
  });
  if (records.some(r => r.status !== 'admitted')) {
    throw policy.fail('ATEAM_RPE_HANDOFF_REPLAN_REQUIRED', 'The canonical handoff exceeds the RPE disclosure plan.');
  }
  return input.handoffs.map((handoff, index) => ({ ...handoff, relationalReceiptRef: records[index].receiptId }));
}

module.exports = { admitHandoffs, messageDigest, authority };
