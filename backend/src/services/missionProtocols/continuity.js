'use strict';

const path = require('node:path');
const { withTransaction } = require('../../db');
const { digest } = require('../evidenceProtocol/canonical');
const { FencedResource } = require('../continuityProtocol/fence');
const { ContinuityHandoff } = require('../continuityProtocol/handoff');
const store = require('./continuityStore');
const values = require('./continuityValues');

async function current(binding) {
  if (binding.preparing) throw new Error('MISSION_CONTINUITY_SEALED_AUTHORITY_REQUIRED');
  await require('./context').assertCurrent(binding);
}

function resource(binding) {
  return new FencedResource({ dbPath: path.join(values.directory(binding), 'fence.sqlite'),
    authorize: request => require('./context').authorize(binding, request) });
}

async function verifyCheckpoint(binding, request) {
  await current(binding);
  const snapshot = await store.loadCheckpoint(binding, request.bundle.checkpoint);
  if (digest(await store.nativeSnapshot(binding, snapshot.run.id)) !== digest(snapshot)) {
    throw new Error('MISSION_CONTINUITY_SOURCE_CHANGED');
  }
  return { status: 'validated', transferId: request.transferId, bundleDigest: request.bundleDigest,
    checkpointDigest: request.bundle.checkpoint.digest, sourceHistoryDigest: request.source.historyDigest,
    requestDigest: digest(request), receiptDigest: digest(['native-mission-checkpoint', request, snapshot]) };
}

function handoff(binding, fence) {
  return new ContinuityHandoff({ dbPath: path.join(values.directory(binding), 'handoff.sqlite'),
    authorize: message => require('./context').authorize(binding, message),
    verifyCheckpoint: request => verifyCheckpoint(binding, request),
    activateAuthority: async request => { await current(binding); return fence.transfer(request); } });
}

async function transfer(binding, previous, fence) {
  const id = digest([store.key(binding), previous.actor, binding.actor]);
  const runtime = handoff(binding, fence);
  try {
    let state = runtime.state(id);
    if (!state) {
      const snapshot = await store.nativeSnapshot(binding, previous.runId);
      const checkpoint = await store.checkpoint(binding, snapshot);
      state = { transferId: id, source: values.identity(previous, digest(snapshot)),
        successor: values.identity(binding, digest(await store.nativeSnapshot(binding, binding.runId))),
        bundle: values.bundle({ checkpoint, snapshot, successor: binding.actor }),
        authority: { previousGeneration: previous.generation, newGeneration: previous.generation + 1 },
        generations: binding.generations };
      await runtime.apply(values.message(binding, state, 'OFFER_HANDOFF'));
    }
    for (const [phase, type] of [['offered', 'SEAL_CHECKPOINT'], ['sealed', 'ACCEPT_RESPONSIBILITY'],
      ['accepted', 'ACTIVATE_SUCCESSOR'], ['activation_pending', 'ACTIVATE_SUCCESSOR']]) {
      state = runtime.state(id);
      if (state.status === phase) {
        const snapshot = await store.nativeSnapshot(binding, previous.runId);
        await store.checkpoint(binding, snapshot);
        await runtime.apply(values.message(binding, { ...state, generations: binding.generations }, type));
      }
    }
    state = runtime.state(id);
    if (state.status !== 'activated') throw new Error('MISSION_CONTINUITY_RECOVERY_REQUIRED');
    return { generation: state.authority.newGeneration, transferId: id };
  } finally { runtime.close(); }
}

async function initialize(binding) {
  if (!binding) return null;
  return withTransaction(binding.db, async () => {
    await current(binding); await store.ensure(binding.db);
    const previous = await store.read(binding);
    const fence = resource(binding);
    try {
      if (previous?.runId === binding.runId) return assertOwner(binding, fence, previous);
      let succession = { generation: 1, transferId: null };
      if (previous) succession = await transfer(binding, previous, fence);
      else await fence.bootstrap({ ...values.context(binding), operationId: store.key(binding),
        owner: binding.actor, generation: 1, permissions: [values.resource], budget: values.budget });
      await current(binding);
      const next = { runId: binding.runId, actor: binding.actor, scope: binding.scope, missionId: binding.missionId,
        workspaceId: binding.workspaceId, ...succession, revision: (previous?.revision || 0) + 1 };
      await store.write(binding, next, previous);
      return next;
    } finally { fence.close(); }
  });
}

function assertOwner(binding, fence, state) {
  const authority = fence.authority(values.context(binding));
  if (!state || state.runId !== binding.runId || !values.same(state.actor, binding.actor)
    || !values.same(authority?.owner, binding.actor) || authority.generation !== state.generation) {
    throw new Error('MISSION_CONTINUITY_STALE_INCARNATION');
  }
  return state;
}

async function beforeEffect(binding, event) {
  if (!binding) return null;
  return withTransaction(binding.db, async () => {
    await current(binding); await store.ensure(binding.db);
    if (event.payload?.executionRunId !== binding.runId) throw new Error('MISSION_CONTINUITY_EVENT_RUN_MISMATCH');
    const fence = resource(binding);
    try {
      const state = assertOwner(binding, fence, await store.read(binding));
      const effectDigest = digest(JSON.parse(JSON.stringify(event)));
      const receipt = await fence.execute({ ...values.context(binding), operationId: digest([binding.runId, effectDigest]),
        actor: binding.actor, generation: state.generation, resourceId: values.resource, key: effectDigest,
        value: { runId: binding.runId, eventDigest: effectDigest }, cost: 0 });
      await current(binding);
      assertOwner(binding, fence, await store.read(binding));
      return { status: 'authorized', generation: state.generation, receipt, externalExecutionAuthorized: false };
    } finally { fence.close(); }
  });
}

async function beforeExecution(binding) {
  return withTransaction(binding.db, async () => {
    await current(binding);
    const fence = resource(binding);
    try { return assertOwner(binding, fence, await store.read(binding)); }
    finally { fence.close(); }
  });
}

module.exports = { initialize, beforeExecution, beforeEffect };
