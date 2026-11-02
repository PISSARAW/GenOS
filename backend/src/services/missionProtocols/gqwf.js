'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { withTransaction } = require('../../db');
const context = require('./context');
const receipts = require('./store');
const store = require('./gqwfStore');
const worlds = require('./gqwfWorld');
const promotion = require('./gqwfPromotion');
const proof = require('./gqwfProof');
const { physicalWorld } = require('../gqwfExchange/promotionIntegrity');

async function nativeSession(db, runId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='gqwf_execution_sessions'");
  return table ? db.get('SELECT * FROM gqwf_execution_sessions WHERE execution_run_id=?', runId) : null;
}

async function initialize(binding) {
  await withTransaction(binding.db, () => store.initialize(binding.db));
}

async function initialHead(session, row) {
  const binding = session.binding;
  const head = await binding.db.get('SELECT root_hash,generation FROM gqwf_heads WHERE workspace_id=? AND name=?',
    binding.workspaceId, promotion.HEAD);
  if (head) {
    if (head.root_hash !== row.base_hash) throw new Error('MISSION_GQWF_BASE_REEVALUATION_REQUIRED');
    return head;
  }
  await session.promotionProtocol.initializeHead({ scope: binding.scope, name: promotion.HEAD, rootHash: row.base_hash });
  return { root_hash: row.base_hash, generation: 0 };
}

async function prepare(ctx) {
  const binding = ctx.protocolBinding || await context.prepare(ctx);
  if (!binding) return null;
  const row = await nativeSession(binding.db, binding.runId);
  if (!row) throw new Error('MISSION_GQWF_NATIVE_SESSION_REQUIRED');
  await initialize(binding);
  const session = await worlds.open(binding, row);
  try {
    const prior = await store.read(binding.db, binding.runId);
    const world = prior?.baseWorld || await worlds.descriptor(session, { rootHash: row.base_hash, kind: 'base' });
    const verified = await worlds.transfer(session, world);
    await promotion.create(session);
    const head = await initialHead(session, row);
    const state = prior || { runId: binding.runId, workspaceId: binding.workspaceId, sourcePath: row.source_path,
      baseHash: row.base_hash, baseGeneration: head.generation, baseWorld: world, baseReceipt: verified.receipt };
    if (state.baseHash !== row.base_hash || state.workspaceId !== row.workspace_id) throw new Error('MISSION_GQWF_NATIVE_BASE_CHANGED');
    if (!prior) await store.save(binding.db, { expected: null, state });
    await receipts.record(binding, { protocol: 'GQWF', point: 'base-world', result: verified.receipt });
    return verified.receipt;
  } finally { session.exchange.close(); }
}

async function observeCandidate(db, runId) {
  const binding = await context.load(db, runId);
  if (!binding) return null;
  await context.assertCurrent(binding); await initialize(binding);
  const row = await nativeSession(db, runId);
  if (!row?.candidate_hash) throw new Error('MISSION_GQWF_NATIVE_CANDIDATE_REQUIRED');
  const prior = await store.read(db, runId);
  if (!prior) throw new Error('MISSION_GQWF_BASE_EXCHANGE_REQUIRED');
  if (prior.candidateWorld && prior.candidateWorld.rootHash !== row.candidate_hash) throw new Error('MISSION_GQWF_NEW_CANDIDATE_RUN_REQUIRED');
  const session = await worlds.open(binding, row);
  try {
    const world = prior.candidateWorld || await worlds.descriptor(session, { rootHash: row.candidate_hash, kind: 'candidate' });
    const verified = await worlds.transfer(session, world);
    if (!prior.candidateWorld) await store.save(db, { expected: prior, state: { ...prior, candidateWorld: world, candidateReceipt: verified.receipt } });
    await receipts.record(binding, { protocol: 'GQWF', point: 'candidate-world', result: verified.receipt });
    return verified.receipt;
  } finally { session.exchange.close(); }
}

async function applicable(db, input) {
  const binding = await context.load(db, input.runId);
  if (!binding) return null;
  const row = await nativeSession(db, binding.runId);
  if (!row) {
    if (binding.mission.executionWorkspace?.backend === 'gqwf') throw new Error('MISSION_GQWF_NATIVE_SESSION_REQUIRED');
    return null;
  }
  await context.assertCurrent(binding); await initialize(binding);
  const metadata = await store.read(db, binding.runId);
  if (!metadata?.candidateWorld) throw new Error('MISSION_GQWF_VERIFIED_CANDIDATE_REQUIRED');
  if (input.agentId && input.agentId !== binding.agentId) throw new Error('MISSION_GQWF_ACTOR_MISMATCH');
  return { binding, row, metadata };
}

async function nativePromotion(binding, value) {
  if (value.agentId !== binding.agentId || value.workspaceId !== binding.workspaceId) throw new Error('MISSION_GQWF_PROMOTION_ACTOR_MISMATCH');
  const run = await binding.db.get('SELECT contract_id FROM strategy_execution_runs WHERE id=?', binding.runId);
  const saved = await require('../strategyContractService').getContractById(binding.db, run.contract_id);
  if (value.contractId !== saved.id || digest(value.contract) !== digest(saved.contract)) throw new Error('MISSION_GQWF_PROMOTION_CONTRACT_CHANGED');
}

async function assertProtocolPromotion(db, input) {
  const { promotion: native, gateContext } = input;
  const state = await applicable(db, { runId: native.runId, agentId: native.agentId });
  if (!state) return { status: 'not_applicable' };
  await nativePromotion(state.binding, native);
  if (!gateContext || digest(gateContext.report) !== digest(native.report)) throw new Error('MISSION_GQWF_PROMOTION_GATE_CONTEXT_REQUIRED');
  require('../strategyPromotionGate').assertPromotionGate(native.contract, gateContext);
  const session = await worlds.open(state.binding, state.row);
  try {
    session.mode = 'prepare'; session.promotion = native; session.gateContext = gateContext;
    await worlds.transfer(session, state.metadata.candidateWorld); proof.current(state.metadata.candidateWorld);
    await promotion.create(session);
    const descriptor = await promotion.prepare(session, state.metadata);
    if (state.metadata.prepared && digest(state.metadata.prepared) !== digest(descriptor)) throw new Error('MISSION_GQWF_PREPARED_BINDING_CHANGED');
    if (!state.metadata.prepared) await store.save(db, { expected: state.metadata, state: { ...state.metadata, prepared: descriptor } });
    native.gqwfProtocol = descriptor;
    return descriptor;
  } finally { session.exchange.close(); }
}

async function commitReserved(db, input) {
  const journal = await require('../promotionExecutionJournal').read(db, input.runId);
  if (!journal) throw new Error('MISSION_GQWF_SIGNED_RESERVED_INTENT_REQUIRED');
  const native = journal.payload.promotion;
  const state = await applicable(db, { runId: input.runId, agentId: native.agentId });
  if (!state) return { status: 'not_applicable' };
  await nativePromotion(state.binding, native);
  if (digest(native.gqwfProtocol) !== digest(state.metadata.prepared)) throw new Error('MISSION_GQWF_RESERVED_CANDIDATE_MISMATCH');
  const session = await worlds.open(state.binding, state.row);
  try {
    session.mode = 'reserved'; session.descriptor = native.gqwfProtocol;
    session.candidate = promotion.candidate(state.metadata, state.metadata.candidateWorld);
    session.conversationId = session.descriptor.conversationId;
    await promotion.create(session);
    const query = { scope: state.binding.scope, missionId: state.binding.missionId,
      conversationId: session.conversationId, candidateId: session.candidate.candidateId };
    const candidateState = await session.promotionProtocol.state(query);
    if (!candidateState || !['prepared', 'committed'].includes(candidateState.status)) throw new Error('MISSION_GQWF_PREPARED_CANDIDATE_REQUIRED');
    await worlds.transfer(session, state.metadata.candidateWorld);
    proof.current(state.metadata.candidateWorld);
    await physicalWorld(db, { workspaceId: state.binding.workspaceId, world: state.metadata.candidateWorld, scope: state.binding.scope });
    let receipt = candidateState.receipt;
    if (!receipt) {
      const offered = session.exchange.store.state({ ...query, worldId: session.candidate.worldId, worldDigest: session.candidate.worldDigest });
      const frame = worlds.frame(session, { type: 'COMMIT', payload: { candidateId: session.candidate.candidateId,
        candidateDigest: digest(session.candidate) }, conversationId: session.conversationId, previous: candidateState.lastMessageId,
      createdAt: offered.offerMessage.createdAt, expiresAt: offered.offerMessage.expiresAt });
      receipt = await session.promotionProtocol.apply(frame);
    }
    const head = await session.promotionProtocol.head({ scope: state.binding.scope, name: promotion.HEAD });
    if (head.rootHash !== receipt.rootHash || head.generation !== receipt.generation) throw new Error('MISSION_GQWF_HEAD_ADVANCED_AFTER_RECEIPT');
    await receipts.record(state.binding, { protocol: 'GQWF', point: 'head-publication', result: receipt });
    return receipt;
  } finally { session.exchange.close(); }
}

async function finishInProcess(db, input) {
  const row = await nativeSession(db, input.runId);
  if (!row) return { status: 'not_applicable' };
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', input.runId);
  const successful = ['completed', 'awaiting_approval'].includes(run?.status);
  if (!successful && !['failed', 'cancelled', 'blocked'].includes(run?.status)) throw new Error('MISSION_GQWF_TERMINAL_RUN_REQUIRED');
  return require('../gqwf/missionExecution').finalizeMissionWorkspace({ db, executionRunId: input.runId,
    outcomeStatus: successful ? 'completed' : 'failed' });
}

module.exports = { prepare, observeCandidate, assertProtocolPromotion, commitReserved, finishInProcess,
  reconcileCatalog: (db, input) => require('./gqwfCatalog').reconcile(db, input) };
