'use strict';
const store = require('../axolotlStateStore');
const observation = require('../axolotlObservationService');
const regeneration = require('../axolotlRegenerationService');
const messages = require('../axolotlMessageService');
const { fail, digest } = require('./contract');

function channel(input) {
  const payload = { missionId: input.context.missionId, contextText: input.contextText };
  const topology = { purpose: 'mission-research-context', missionId: input.context.missionId,
    components: [{ id: 'source', role: 'research_context', status: 'active' },
      { id: 'relay', role: 'context_relay', status: input.contract.exerciseContextRecovery ? 'failed' : 'active' },
      { id: 'sink', role: 'mission_context', status: 'active' }],
    connections: input.contract.exerciseContextRecovery ? [] : [
      { from: 'source', to: 'relay', type: 'context' }, { from: 'relay', to: 'sink', type: 'context' }],
    knowledge: { missionContext: input.contextText } };
  const functionalContract = { requiredRoles: ['research_context', 'context_relay', 'mission_context'], probes: [
    { id: 'context-route', kind: 'route', from: 'source', to: 'sink', payload, expected: payload },
    { id: 'context-recall', kind: 'recall', key: 'missionContext', expected: input.contextText }] };
  return { topology, functionalContract, payload };
}
async function initialize(db, input, config) {
  await store.ensure(db);
  const existing = await store.activeTopology(db, input.context.orchestratorId);
  if (existing) throw fail('MISSION_MECHANISMS_CONTEXT_CHANNEL_ALREADY_OWNED');
  await store.save(db, { kind: 'topology', id: input.context.orchestratorId, value: {
    topology: config.topology, functionalContract: config.functionalContract, workspaceId: input.parent.workspace_id } });
}
async function recover(db, input, config) {
  const plan = await regeneration.planRegeneration({ db, orchestratorId: input.context.orchestratorId,
    mission: 'Rétablir le canal natif du contexte vérifié de cette mission.',
    reason: 'Explicit exerciseContextRecovery: declared missing relay edges in this context channel only.',
    currentTopology: config.topology, functionalContract: config.functionalContract,
    scope: { type: 'components', componentIds: ['relay'] },
    executionBudget: { events: 100, durationMs: 15000, experiments: 4 } });
  const result = await regeneration.executeRegeneration({ db, sessionId: plan.sessionId,
    context: { orchestratorId: input.context.orchestratorId } });
  if (!result.success) throw fail('MISSION_MECHANISMS_CONTEXT_RECOVERY_FAILED');
  return result;
}
async function deliver(db, input) {
  const config = channel(input), owner = { db, orchestratorId: input.context.orchestratorId,
    executionBudget: { events: 100, durationMs: 15000, experiments: 4 } };
  await initialize(db, input, config);
  const before = await observation.observe(owner);
  if (before.success === input.contract.exerciseContextRecovery) throw fail('MISSION_MECHANISMS_CONTEXT_EXERCISE_MISMATCH');
  const recovery = input.contract.exerciseContextRecovery ? await recover(db, input, config) : null;
  const after = await observation.observe(owner);
  if (!after.success) throw fail('MISSION_MECHANISMS_CONTEXT_UNREACHABLE');
  const sent = await messages.send({ ...owner, from: 'source', to: 'sink', payload: config.payload });
  const received = await messages.receive({ ...owner, componentId: 'sink' });
  const message = received.messages.find(item => item.id === sent.messageId);
  if (digest(message?.payload) !== digest(config.payload)) throw fail('MISSION_MECHANISMS_CONTEXT_DELIVERY_CHANGED');
  return { contextText: message.payload.contextText, contextDigest: digest(message.payload.contextText),
    messageId: message.id, messageVersion: message.version, beforeEvidenceRef: before.evidenceRef,
    afterEvidenceRef: after.evidenceRef, recoveryEvidenceRef: recovery?.evidenceRef || null,
    recoverySessionId: recovery?.sessionId || null, exerciseDeclared: input.contract.exerciseContextRecovery,
    scope: 'native transport of this mission context; not spontaneous replacement of an LLM worker' };
}
async function verify(db, input) {
  const receipt = input.receipt;
  const message = await store.read(db, { kind: 'message', id: receipt.channel.messageId });
  assertMessage(receipt, message);
  const before = await store.evidence(db, receipt.channel.beforeEvidenceRef);
  const after = await store.evidence(db, receipt.channel.afterEvidenceRef);
  const active = await store.activeTopology(db, receipt.orchestratorId);
  assertChannelScope(receipt, { active, before, after, message });
  if (before.result.passed === receipt.contract.exerciseContextRecovery || after.result.passed !== true) {
    throw fail('MISSION_MECHANISMS_CONTEXT_PROBE_INVALID');
  }
  if (receipt.contract.exerciseContextRecovery) await verifyRecovery(db, receipt);
  return message.payload.contextText;
}
function assertMessage(receipt, message) {
  if (message?.orchestratorId !== receipt.orchestratorId || message.workspaceId !== receipt.workspaceId
    || message.status !== 'consumed' || message.payload.missionId !== receipt.missionId
    || digest(message.payload.contextText) !== receipt.contextDigest) throw fail('MISSION_MECHANISMS_CONTEXT_RECEIPT_INVALID');
}
function assertChannelScope(receipt, state) {
  const { active, before, after, message } = state;
  if (active?.workspaceId !== receipt.workspaceId || active.topology.missionId !== receipt.missionId
    || active.topology.purpose !== 'mission-research-context'
    || active.topology.knowledge.missionContext !== message.payload.contextText
    || before.contractHash !== store.hash(active.functionalContract)
    || after.contractHash !== before.contractHash || after.subjectHash !== store.hash(active.topology)) {
    throw fail('MISSION_MECHANISMS_CONTEXT_SCOPE_CHANGED');
  }
}
async function verifyRecovery(db, receipt) {
  const session = await regeneration.getRegenerationSession(receipt.channel.recoverySessionId,
    { db, orchestratorId: receipt.orchestratorId });
  const evidence = await store.evidence(db, receipt.channel.recoveryEvidenceRef);
  if (session.status !== 'completed' || session.evidenceRef !== receipt.channel.recoveryEvidenceRef
    || evidence.result.passed !== true || session.workspaceId !== receipt.workspaceId) {
    throw fail('MISSION_MECHANISMS_RECOVERY_RECEIPT_INVALID');
  }
}
module.exports = { deliver, verify };
