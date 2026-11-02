'use strict';

const path = require('node:path');
const { digest } = require('../evidenceProtocol/canonical');
const { GqwfExchange } = require('../gqwfExchange/exchange');
const { createMessage } = require('../gqwfExchange/contract');
const storage = require('../gqwf/storage');
const closure = require('../gqwf/executionClosure');
const context = require('./context');
const proof = require('./gqwfProof');
const { samePath } = require('../gqwfExchange/casSafety');

async function authorize(session, input) {
  const frame = input.request || input.message || input;
  if (!await context.authorize(session.binding, frame)) return false;
  const expected = { sender: session.binding.actor, audience: session.binding.actor, authority: session.binding.authority,
    actor: session.binding.actor, generations: session.binding.generations };
  return Object.entries(expected).every(([key, value]) => !Object.hasOwn(frame, key) || digest(frame[key]) === digest(value));
}

function assertWorkspace(binding, input) {
  const { registered, nativeRow } = input;
  if (!registered || registered.organization_id !== binding.scope.organizationId || registered.project_id !== binding.scope.projectId ||
    nativeRow.workspace_id !== binding.workspaceId || !samePath(registered.path, nativeRow.source_path)) {
    throw new Error('MISSION_GQWF_WORKSPACE_SCOPE_MISMATCH');
  }
  const source = binding.mission.gqwfSourceWorkspaceRoot || binding.mission.executionWorkspace?.sourcePath;
  if (source && !samePath(source, nativeRow.source_path)) throw new Error('MISSION_GQWF_SOURCE_PATH_CHANGED');
}

async function open(binding, nativeRow) {
  const registered = await binding.db.get('SELECT * FROM workspaces WHERE id=?', nativeRow.workspace_id);
  assertWorkspace(binding, { registered, nativeRow });
  await context.assertCurrent(binding);
  const session = { binding, nativeRow };
  session.exchange = new GqwfExchange({ dbPath: path.join(binding.directory, 'gqwf-exchange.db'), workspaceRoot: registered.path,
    authorize: input => authorize(session, input), verifyWorld: async request => {
      await context.assertCurrent(binding);
      const expected = [nativeRow.base_hash, nativeRow.candidate_hash].filter(Boolean);
      if (!expected.includes(request.world.rootHash) || request.world.workspaceId !== nativeRow.workspace_id) {
        throw new Error('MISSION_GQWF_WORLD_NOT_PRODUCED_BY_RUN');
      }
      return { status: 'validated', requestDigest: digest(request),
        receiptDigest: digest({ runId: binding.runId, rootHash: request.world.rootHash, closureHash: request.world.closureHash }) };
    } });
  try {
    await session.exchange.ready; await session.exchange.assertSafeCas();
    await session.exchange.db.run(`INSERT OR IGNORE INTO workspaces(id,path,organization_id,project_id) VALUES(?,?,?,?)`,
      nativeRow.workspace_id, registered.path, registered.organization_id, registered.project_id);
    return session;
  } catch (error) { session.exchange.close(); throw error; }
}

function frame(session, input) {
  const binding = session.binding;
  const id = digest([binding.runId, input.conversationId, input.type]);
  return createMessage({ messageId: id, idempotencyKey: id, operationId: input.conversationId,
    missionId: binding.missionId, conversationId: input.conversationId, scope: binding.scope,
    sender: binding.actor, audience: binding.actor, generations: binding.generations, authority: binding.authority,
    createdAt: input.createdAt, expiresAt: input.expiresAt || binding.expiresAt, causalRefs: input.previous ? [input.previous] : [],
    type: input.type, payload: input.payload });
}

async function descriptor(session, input) {
  await session.exchange.assertSafeCas();
  const workspaceId = session.nativeRow.workspace_id;
  const manifest = await storage.root(session.binding.db, workspaceId, input.rootHash);
  const sealed = await closure.sealExecutionClosure(session.binding.db, { workspaceId, rootHash: input.rootHash, ...proof.executionClosure() });
  await session.exchange.assertSafeCas();
  const inspected = await closure.inspectExecutionClosure(session.binding.db, { workspaceId, closureHash: sealed.closureHash });
  return { worldId: `${session.binding.runId}:${input.kind}`, workspaceId,
    origin: { kind: input.kind === 'base' ? 'observed' : 'isolated', sourceRef: `gqwf-execution:${session.binding.runId}` },
    rootHash: input.rootHash, manifest, manifestSerialized: JSON.stringify(manifest), closure: inspected.manifest,
    closureSerialized: JSON.stringify(inspected.manifest), closureHash: sealed.closureHash };
}

async function transfer(session, world) {
  const conversationId = `gqwf:${world.worldId}`;
  const query = { scope: session.binding.scope, missionId: session.binding.missionId, conversationId,
    worldId: world.worldId, worldDigest: digest(world) };
  const state = session.exchange.store.state(query);
  if (state?.status === 'verified') return session.exchange.verifiedWorld(query);
  const createdAt = state?.offerMessage.createdAt || new Date().toISOString();
  const expiresAt = state?.offerMessage.expiresAt || session.binding.expiresAt;
  let previous;
  for (const type of ['OFFER_WORLD', 'NEED_OBJECTS', 'VERIFY_WORLD']) {
    const payload = type === 'OFFER_WORLD' ? { world } : { worldId: world.worldId, worldDigest: digest(world) };
    const envelope = frame(session, { type, payload, conversationId, previous, createdAt, expiresAt });
    const result = await session.exchange.apply(envelope);
    if (type === 'NEED_OBJECTS' && result.objects.length) throw new Error('MISSION_GQWF_NATIVE_CAS_OBJECTS_UNAVAILABLE');
    previous = envelope.messageId;
  }
  return session.exchange.verifiedWorld(query);
}

module.exports = { authorize, open, frame, descriptor, transfer };
