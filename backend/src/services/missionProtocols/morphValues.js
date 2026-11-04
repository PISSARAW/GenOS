'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { createMessage } = require('../morphProtocol/contract');
const { verifyConservation } = require('../morphProtocol/conservation');
const native = require('./morphNative');

function actor(input, agentId) {
  return { agentId, incarnationId: `native:${input.ctx.missionId}`, trustDomain: input.ctx.req.tenant.organizationId };
}

function snapshot(input, baseline) {
  const state = native.raw(input.preState);
  const members = Object.keys(state.agents).sort().map(id => actor(input, id));
  if (!members.length) throw new Error('MISSION_MORPH_EMPTY_NATIVE_ROSTER');
  const result = { topology: stateTopology(input, state),
    members, tasks: baseline.payload.agents.filter(agent => agent.current_task)
      .map(agent => ({ taskId: `native-task:${agent.id}`, owner: actor(input, agent.id), content: { task: agent.current_task } })),
    obligations: [], permissions: [], budgets: [], claims: [],
    evidence: [{ evidenceId: 'native-baseline', content: { baseline: baseline.payload } }],
    provenance: [{ agentId: input.ctx.agentId, content: { authority: baseline.row.principal_id } }],
    dependencies: [], audiences: [], uncertainties: [], questions: [], unknownEffects: [] };
  return input.ctx.plan.aTeamPendingReplacement
    ? require('../aTeam/adaptation/liveMorphogenesisProtocol').sourceSnapshot(input, result) : result;
}

function plan(input, sourceSnapshot) {
  const source = native.raw(input.preState);
  const members = Object.keys(source.agents).sort().map(id => actor(input, id));
  if (!native.same(sourceSnapshot.members, members)
    || sourceSnapshot.topology !== stateTopology(input, source)) {
    throw new Error('MISSION_MORPH_PROTOCOL_NATIVE_SOURCE_DIVERGED');
  }
  const topology = input.ctx.plan.aTeamPendingReplacement ? input.ctx.plan.targetTopology
    : input.ctx.plan.targetOrganization || input.ctx.plan.targetTopology;
  const targetSnapshot = { ...sourceSnapshot, topology };
  let result = { transitionId: transitionId(input),
    sourceVersion: input.preState.currentMorphologyVersion, targetVersion: input.preState.currentMorphologyVersion + 1,
    participants: [actor(input, input.ctx.agentId)], coordinator: actor(input, input.ctx.agentId),
    sourceSnapshot, targetSnapshot, transfers: [] };
  if (input.ctx.plan.aTeamPendingReplacement) result = require('../aTeam/adaptation/liveMorphogenesisProtocol').targetPlan(input, result);
  verifyConservation(result);
  return result;
}

function stateTopology(input, state) {
  return input.ctx.plan.aTeamPendingReplacement ? state.topologyState.topology
    : state.topologyState.organization || state.topologyState.topology;
}

const transitionId = input => digest([input.ctx.transitionId, input.snapshot.id, input.snapshot.planHash, input.snapshot.hash]);

function message(input, state, type) {
  const id = digest([state.plan.transitionId, type]);
  const payload = type === 'PROPOSE' ? { plan: state.plan } : { transitionId: state.plan.transitionId, planDigest: digest(state.plan) };
  if (type === 'READY') payload.receiptDigest = state.readyReceipt.receiptDigest;
  if (type === 'RECOVERY_REQUIRED') payload.reason = state.reason || 'native_application_unconfirmed';
  return createMessage({ messageId: id, idempotencyKey: id, operationId: input.ctx.transitionId,
    missionId: input.ctx.missionId, conversationId: input.snapshot.id, scope: input.ctx.req.tenant,
    sender: state.plan.coordinator, audience: state.plan.coordinator, type, payload,
    generations: { incarnation: 1, organization: state.committedDecision ? state.plan.targetVersion : state.plan.sourceVersion, workspace: 1 },
    authority: { authorityId: input.authority.requestSha256, generation: state.plan.sourceVersion },
    createdAt: new Date(input.authority.expiresAtUnixMs - 30000).toISOString(),
    expiresAt: new Date(input.authority.expiresAtUnixMs).toISOString(), causalRefs: state.lastMessageId ? [state.lastMessageId] : [] });
}

module.exports = { actor, snapshot, plan, transitionId, message };
