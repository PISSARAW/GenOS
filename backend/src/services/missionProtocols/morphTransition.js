'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');
const { MorphCoordinator } = require('../morphProtocol/coordinator');
const { MorphParticipant } = require('../morphProtocol/participant');
const bindings = require('../morphProtocol/coordinatorBindings');
const native = require('./morphNative');
const values = require('./morphValues');

async function directory(input) {
  const databases = await input.ctx.db.all('PRAGMA database_list');
  const filename = databases.find(row => row.name === 'main')?.file;
  if (!filename) throw new Error('MISSION_MORPH_DURABLE_DATABASE_REQUIRED');
  const result = path.join(`${filename}.protocols`, `morph-${digest([input.ctx.req.tenant, input.ctx.missionId]).slice(7)}`);
  fs.mkdirSync(result, { recursive: true });
  return result;
}

async function authorized(input, request) {
  await native.admitted(input);
  const frame = request.request || request;
  if (frame.scope && !native.same(frame.scope, input.ctx.req.tenant)) return false;
  if (frame.missionId && frame.missionId !== input.ctx.missionId) return false;
  return true;
}

async function checkpoint(input, request) {
  await native.source(input);
  return { status: 'validated', requestDigest: digest(request), checkpointDigest: request.checkpointDigest,
    receiptDigest: digest(['verified-native-transition', input.snapshot, request]) };
}

function runtimes(input, folder) {
  let coordinator;
  const participant = new MorphParticipant({ dbPath: path.join(folder, 'participant.sqlite'),
    participantId: values.actor(input, input.ctx.agentId), authorize: request => authorized(input, request),
    verifyDecision: query => coordinator.decision(query),
    verifyCheckpoint: request => checkpoint(input, request) });
  coordinator = new MorphCoordinator({ dbPath: path.join(folder, 'coordinator.sqlite'),
    authorize: request => authorized(input, request), verifyCheckpoint: request => checkpoint(input, request),
    verifyReady: ({ query }) => participant.readyReceipt(query),
    verifyApplied: async ({ query }) => { await native.applied(input); return participant.receipt(query); } });
  return { coordinator, participant };
}

async function prepare(input, runtime, plan) {
  const { coordinator, participant } = runtime;
  if (!coordinator.state(plan.transitionId)) await coordinator.apply(values.message(input, { plan }, 'PROPOSE'));
  for (const [phase, type] of [['proposed', 'QUIESCE'], ['quiescing', 'CHECKPOINT'], ['checkpointed', 'PREPARE']]) {
    const state = coordinator.state(plan.transitionId);
    if (state.status === phase) await coordinator.apply(values.message(input, state, type));
  }
  let state = coordinator.state(plan.transitionId);
  const query = bindings.query(state);
  if (state.status === 'prepared') {
    const readyReceipt = await participant.prepare({ ...query, plan });
    await coordinator.apply(values.message(input, { ...state, readyReceipt }, 'READY'));
  }
  state = coordinator.state(plan.transitionId);
  if (state.status === 'ready') await coordinator.apply(values.message(input, state, 'COMMIT'));
  return bindings.query(coordinator.state(plan.transitionId));
}

async function resolve(input, runtime, query) {
  const state = runtime.coordinator.state(query.transitionId);
  if (state.status === 'finalized') { await native.applied(input); return state; }
  if (!state.committedDecision) throw new Error('MISSION_MORPH_COMMIT_DECISION_REQUIRED');
  await native.applied(input);
  await runtime.participant.commit(query);
  return runtime.coordinator.apply(values.message(input, state, 'FINALIZE'));
}

async function recover(input, runtime, query) {
  const state = runtime.coordinator.state(query.transitionId);
  let recorded = state.status === 'recovery_required';
  let recordFailure = null;
  try {
    if (!recorded) await runtime.coordinator.apply(values.message(input, state, 'RECOVERY_REQUIRED'));
    recorded = true;
  } catch (error) { recordFailure = error.message; }
  return { transitionId: query.transitionId, status: 'recovery_required', recorded, recordFailure,
    decision: runtime.coordinator.decision(query) };
}

async function applyNative(input, operation) {
  const { runtime, query, baseline, apply } = operation;
  const held = runtime.coordinator.state(query.transitionId);
  if (held.status === 'finalized') return { protocol: await resolve(input, runtime, query), replay: true, committed: true };
  if (baseline.row.status === 'committed') return { committed: true, replay: true, protocol: await resolve(input, runtime, query) };
  if (baseline.row.status !== 'applying') return { committed: false, protocol: await recover(input, runtime, query) };
  let result;
  try {
    result = await withTransaction(input.ctx.db, async () => { await native.source(input); return guardedCommit(input, apply); });
    if (result.committed !== true) return { ...result, protocol: await recover(input, runtime, query) };
    return { ...result, protocol: await resolve(input, runtime, query) };
  } catch (error) {
    const protocol = await recover(input, runtime, query);
    return { ...result, committed: result?.committed === true, protocol, code: error.code || error.message };
  }
}

async function guardedCommit(input, apply) {
  const persist = input.ctx.persistCommit;
  input.ctx.persistCommit = async receipt => {
    await native.admitted(input);
    const result = await persist(receipt);
    await native.admitted(input);
    return result;
  };
  try { return await apply(); }
  finally { input.ctx.persistCommit = persist; }
}

async function execute(input, apply) {
  native.bounded(input);
  const folder = await directory(input);
  const baseline = await native.admitted(input);
  const runtime = runtimes(input, folder);
  let plan;
  try {
    require('./morphRecovery').persist(input, runtime.coordinator);
    const scope = input.ctx.req.tenant;
    let participant = runtime.participant.status({ scope });
    if (!participant) {
      await runtime.participant.bootstrap({ scope, version: input.preState.currentMorphologyVersion }, values.snapshot(input, baseline));
      participant = runtime.participant.status({ scope });
    }
    plan = runtime.coordinator.state(values.transitionId(input))?.plan || values.plan(input, participant.snapshot);
    const query = await withTransaction(input.ctx.db, () => prepare(input, runtime, plan));
    return await applyNative(input, { runtime, query, baseline, apply });
  } catch (error) {
    error.protocolDecisionCommitted = Boolean(plan && runtime.coordinator.state(plan.transitionId)?.committedDecision);
    throw error;
  } finally { runtime.participant.close(); runtime.coordinator.close(); }
}

module.exports = { execute, directory };
