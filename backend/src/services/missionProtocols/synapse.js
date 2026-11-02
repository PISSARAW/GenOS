'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { digest } = require('../evidenceProtocol/canonical');
const { SynapseConversation } = require('../synapseProtocol/conversation');
const { createContextCodec } = require('../synapseProtocol/contextCodec');
const { createMessage } = require('../synapseProtocol/contract');
const config = require('./synapseConfiguration');

async function publisher(binding) {
  const row = await binding.db.get(`SELECT a.id AS agentId,a.workspace_id AS workspaceId,
    w.organization_id AS organizationId,w.project_id AS projectId FROM missions m
    JOIN agents child ON child.id=?
    JOIN agents a ON a.id=COALESCE(child.parent_agent_id,m.orchestrator_agent_id)
    JOIN workspaces w ON w.id=a.workspace_id WHERE m.mission_id=?`, binding.agentId, binding.missionId);
  if (!row || row.agentId === binding.agentId) return null;
  if (digest([row.organizationId, row.projectId]) !== digest([binding.scope.organizationId, binding.scope.projectId])) {
    throw new Error('Mission SYNAPSE publisher belongs to another tenant.');
  }
  const run = await binding.db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', row.agentId);
  if (!run) throw new Error('Mission SYNAPSE publisher has no execution incarnation.');
  const held = await require('../gvxMissionProvenance').readRun(binding.db, { runId: run.id,
    scope: { ...binding.scope, entityId: row.agentId } });
  if (held?.mission.id !== binding.missionId) throw new Error('Mission SYNAPSE publisher incarnation belongs to another mission.');
  return { agentId: row.agentId, incarnationId: run.id, trustDomain: binding.scope.organizationId };
}

function frame(binding, input) {
  const id = digest([binding.runId, input.type]);
  return createMessage({ messageId: id, idempotencyKey: id, operationId: binding.runId,
    missionId: binding.missionId, conversationId: binding.runId, type: input.type,
    sender: input.publisher, audience: binding.actor, scope: binding.scope,
    generations: binding.generations, authority: binding.authority,
    createdAt: input.createdAt, expiresAt: binding.expiresAt,
    causalRefs: input.cause ? [input.cause] : [], payload: input.payload });
}

function runtime(binding, source, local) {
  fs.mkdirSync(binding.directory, { recursive: true });
  return new SynapseConversation({ dbPath: path.join(binding.directory, 'synapse.sqlite'),
    actor: binding.actor, authority: binding.authority, incarnationGeneration: binding.generations.incarnation,
    codec: db => createContextCodec(config.configuration(db)),
    authorize: async ({ request }) => {
      await require('./context').assertCurrent(binding);
      if (digest(await publisher(binding)) !== digest(source)) throw new Error('Mission SYNAPSE publisher incarnation changed.');
      if (request.scope && digest(request.scope) !== digest(binding.scope)) return false;
      if (request.missionId && request.missionId !== binding.missionId) return false;
      return true;
    }, localContext: async ({ state }) => ({ ...local, state: state.value, generation: state.generation }) });
}

async function applyContext(binding, source, task) {
  const query = { scope: binding.scope, missionId: binding.missionId, conversationId: binding.runId,
    contextId: `mission-context:${binding.runId}` };
  const local = { contextId: query.contextId, domain: config.DOMAIN, publisher: source,
    audience: [binding.actor], dialectId: 'pending-install', dependencies: [
      { dependencyId: 'mission-run', digest: digest([binding.missionId, binding.runId, binding.scope]) },
      { dependencyId: 'authority', digest: digest(binding.authority) }] };
  const conversation = runtime(binding, source, local);
  try {
    const value = { task: '', missionId: binding.missionId, runId: binding.runId };
    const input = { binding, source, local, query, task, value };
    if (await initializeDocument(conversation, input) === 0) await transfer(conversation, input);
    const applied = await conversation.state(query);
    if (applied.generation !== 1 || applied.value.task !== task || applied.stateDigest !== digest(applied.value)) throw new Error('Mission SYNAPSE actual applied state missing.');
    const receipt = await validateApplied(conversation, { binding, source, local, query, task, value });
    return { status: 'applied', query, state: applied, receipt };
  } finally { conversation.close(); }
}

async function initializeDocument(conversation, input) {
  const { binding, source, local, query, task, value } = input;
  const existing = await conversation.state(query);
  local.dialectId = existing ? conversation.store.dialogue(query)?.context.dictionary.snapshot?.dialectId
    : await config.install(conversation.db, [source, binding.actor]);
  if (existing && existing.value.task !== task && existing.generation !== 0) throw new Error('Mission SYNAPSE applied context differs from requested task.');
  if (!existing) await conversation.initialize(query, { value, generation: 0 });
  return existing?.generation || 0;
}

async function validateApplied(conversation, input) {
  const { binding, source, local, query, task, value } = input;
  const dialogue = conversation.store.dialogue(query);
  if (!dialogue || digest(dialogue.context.publisher) !== digest(source)) throw new Error('Mission SYNAPSE applied publisher changed.');
  const committed = conversation.codec.createDelta({ deltaId: `mission-delta:${binding.runId}`, context: dialogue.context,
    operations: [{ kind: 'put', key: 'task', value: task }], state: value });
  const deltaQuery = { scope: binding.scope, missionId: binding.missionId, conversationId: binding.runId,
    deltaId: committed.delta.deltaId, deltaDigest: digest(committed.delta) };
  const held = await conversation.status(deltaQuery);
  const qualified = await conversation.codec.qualify({ context: dialogue.context, delta: committed.delta,
    representation: held.representation, local: { ...local, state: value, generation: 0 } });
  if (!qualified.compatible) throw new Error('Mission SYNAPSE installed context changed; new declaration required.');
  const receipt = await conversation.receipt(deltaQuery);
  if (!receipt || receipt.resultDigest !== digest(qualified.value)) throw new Error('Mission SYNAPSE applied receipt missing.');
  return receipt;
}

async function transfer(conversation, input) {
  const { binding, source, local, task, value } = input;
  const context = await conversation.codec.capture({ ...local, state: value, generation: 0 });
  const operations = [{ kind: 'put', key: 'task', value: task }];
  const committed = conversation.codec.createDelta({ deltaId: `mission-delta:${binding.runId}`, context, operations, state: value });
  const representation = await conversation.codec.encode({ context, operations });
  const createdAt = new Date().toISOString();
  const declaration = frame(binding, { type: 'DECLARE_CONTEXT', publisher: source, createdAt, payload: { context } });
  await conversation.apply(declaration);
  const offer = frame(binding, { type: 'OFFER_DELTA', publisher: source, createdAt, cause: declaration.messageId,
    payload: { delta: committed.delta, representation } });
  const offered = await conversation.apply(offer);
  const cause = offered.outbound[0]?.messageId || offer.messageId;
  const applied = await conversation.apply(frame(binding, { type: 'APPLY_DELTA', publisher: source, createdAt, cause,
    payload: { deltaId: committed.delta.deltaId, deltaDigest: digest(committed.delta), representation } }));
  if (applied.status !== 'applied') throw new Error('Mission SYNAPSE requested missing context; dispatch refused.');
}

async function prepare(ctx) {
  const binding = await require('./context').prepare(ctx);
  if (!binding) return { status: 'not_applicable', reason: 'mission_binding_absent' };
  const source = await publisher(binding);
  if (!source) return { status: 'not_applicable', reason: 'single_logical_participant' };
  const mission = ctx.normalizedMission;
  const task = String(mission.prompt || mission.currentTask || '');
  const result = await applyContext(binding, source, task);
  await require('./context').assertCurrent(binding);
  mission.prompt = result.state.value.task;
  mission.synapseContext = { query: result.query, stateDigest: result.state.stateDigest,
    generation: result.state.generation, publisher: source, receiver: binding.actor };
  return result;
}

async function beforeExecution(binding) {
  const declared = binding.mission.synapseContext;
  if (!declared) return { status: 'not_applicable', reason: 'single_logical_participant' };
  const source = await publisher(binding);
  if (digest(source) !== digest(declared.publisher)) throw new Error('Mission SYNAPSE publisher changed before execution.');
  const result = await applyContext(binding, source, String(binding.mission.prompt || ''));
  if (result.state.stateDigest !== declared.stateDigest) throw new Error('Mission SYNAPSE dispatched context changed.');
  return result;
}

module.exports = { prepare, beforeExecution, publisher, applyContext };
