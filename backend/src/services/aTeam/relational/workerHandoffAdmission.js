'use strict';

const { withTransaction } = require('../../../db');
const { digest } = require('../../relationalPhysiology');
const integrity = require('../../qualityElevation/qualityReceiptIntegrity');
const policy = require('./teamRelationalPolicy');
const projection = require('./handoffProjection');
const store = require('./handoffAdmissionStore');
const { messageDigest } = require('./handoffAdmissionService');

async function teamForWorker(db, mission) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='topology_sessions'");
  if (!table) return null;
  const rows = await db.all(`SELECT DISTINCT t.id FROM topology_sessions t,
    json_each(t.state_json,'$.members') m WHERE t.topology='a_team'
    AND json_extract(t.state_json,'$.execution.runtimeMissionId')=?
    AND json_extract(m.value,'$.workerId')=? LIMIT 2`, mission.missionId, mission.agentId);
  if (rows.length > 1) throw policy.fail('ATEAM_RPE_TEAM_AMBIGUOUS');
  return rows.length ? require('../teamRunStore').load(db, rows[0].id) : null;
}

function assertIdentity(receipt, input) {
  if (receipt.teamRunId !== input.run.teamRunId || receipt.missionId !== input.mission.missionId
    || receipt.consumerId !== input.mission.agentId || receipt.actorId !== input.run.missionId
    || receipt.handoffId !== input.handoff.handoffId || receipt.handoffDigest !== input.handoff.digest
    || receipt.messageDigest !== messageDigest(input.handoff) || receipt.status !== 'admitted') {
    throw policy.fail('ATEAM_RPE_RECEIPT_SCOPE_MISMATCH');
  }
}

async function assertCurrent(db, input) {
  const now = Date.now(), receipt = input.receipt;
  if (now >= receipt.expiresAt) throw policy.fail('ATEAM_RPE_AUTHORITY_EXPIRED');
  const lease = await require('../../missionEnvelopeAuthorityState').lease(db, input.mission.missionId);
  if (digest(lease) !== receipt.authorityHash) throw policy.fail('ATEAM_RPE_ADMISSION_STALE');
  const scope = receipt.context.scope;
  const snapshot = await projection.load(db, { run: input.run, scope, now, expiresAt: receipt.expiresAt });
  if (snapshot.policyHash !== receipt.policyHash) throw policy.fail('ATEAM_RPE_ADMISSION_STALE');
  const actors = [input.run.missionId, input.mission.agentId];
  if (snapshot.context.agents.some(agent => actors.includes(agent.id) && agent.state !== 'active')) {
    throw policy.fail('ATEAM_RPE_ACTOR_UNAVAILABLE');
  }
  const binding = await require('../../biologicalWorkerStore').latestBindingForMission(db,
    { missionId: receipt.missionId, workerId: receipt.producerId });
  if (binding?.runId !== receipt.sourceRunId) throw policy.fail('ATEAM_RPE_SOURCE_SUPERSEDED');
  await require('../../missionEnvelopeAuthority').assertCompletedRunEvidence(db,
    { agentId: receipt.producerId, runId: receipt.sourceRunId });
}

async function admit(db, input) {
  const run = await teamForWorker(db, input.mission);
  if (!run || !policy.required(run)) return [];
  await require('../../missionEnvelopeAuthority').assertRun(db, {
    agentId: input.mission.agentId, runId: input.executionRun.id, mission: input.mission });
  const graph = await require('../workGraph/workGraphStore').load(db, run.workGraphId);
  if (graph?.teamRunId !== run.teamRunId) throw policy.fail('ATEAM_RPE_GRAPH_SCOPE_MISMATCH');
  const nodeIds = graph.nodes.filter(n => n.ownerAgentId === input.mission.agentId).map(n => n.nodeId);
  const expected = graph.edges.filter(e => nodeIds.includes(e.toNode) && e.blocking !== false);
  const handoffs = input.mission.handoffContext || [];
  if (handoffs.length !== expected.length) throw policy.fail('ATEAM_RPE_HANDOFFS_REQUIRED');
  return withTransaction(db, async tx => {
    const records = [];
    for (const handoff of handoffs) records.push(await consumeOne(tx, { ...input, run, handoff, expected }));
    return records;
  });
}

async function consumeOne(db, input) {
  const edge = input.expected.find(e => e.handoff?.handoffId === input.handoff.handoffId);
  if (!edge?.available || messageDigest(edge.handoff) !== messageDigest(input.handoff)
    || typeof input.handoff.relationalReceiptRef !== 'string') throw policy.fail('ATEAM_RPE_HANDOFF_CHANGED');
  const receipt = await store.readRef(db, input.handoff.relationalReceiptRef);
  assertIdentity(receipt, input);
  await assertCurrent(db, { ...input, receipt });
  return store.consume(db, { receiptId: receipt.receiptId, teamRunId: input.run.teamRunId,
    consumerRunId: input.executionRun.id, consumerId: input.mission.agentId,
    missionId: input.mission.missionId, messageDigest: receipt.messageDigest, observedAt: Date.now(),
    transportAdmission: true, semanticAccepted: false });
}

function consumption(row) {
  const body = row && JSON.parse(row.body_json);
  if (!integrity.authenticated(body) || body.schema !== 'genos.ateam-rpe-consumption/v1') {
    throw policy.fail('ATEAM_RPE_CONSUMPTION_INVALID');
  }
  return body;
}

module.exports = { admit, teamForWorker, assertIdentity, consumption };
