'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { MorphCoordinator } = require('../../src/services/morphProtocol/coordinator');
const { MorphParticipant } = require('../../src/services/morphProtocol/participant');
const fixture = require('./morphProcessFixtures.cjs');

const [role, directory] = process.argv.slice(2);
const same = (left, right) => digest(left) === digest(right);
const identity = role === 'coordinator' ? fixture.COORDINATOR : fixture.PARTICIPANTS.find(item => item.agentId === role);
let principal;
let sequence = 0;
const pending = new Map();

function rpc(peer, action, value) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    process.send({ rpc: true, id, peer, action, value });
  });
}

function verifyFiles(source) {
  const stored = JSON.parse(fs.readFileSync(path.join(directory, 'source.json'), 'utf8'));
  const proof = JSON.parse(fs.readFileSync(path.join(directory, 'proof.json'), 'utf8'));
  if (!same(stored, source) || !same(proof, fixture.EVIDENCE) || proof.runtime !== process.version) {
    throw new Error('MORPH demo source or evidence differs from checkpoint.');
  }
}

async function verifyCoordinatorCheckpoint(request) {
  verifyFiles(request.plan.sourceSnapshot);
  if (!same(request.plan, fixture.PLAN)) throw new Error('MORPH demo authoritative plan or roster mismatch.');
  for (const peer of fixture.PARTICIPANTS) {
    const state = await rpc(peer.agentId, 'status', { scope: fixture.SCOPE });
    if (state.version !== 1 || !same(state.snapshot, fixture.SOURCE) ||
        !['quiesced', 'prepared'].includes(state.phase)) throw new Error('MORPH participant not quiescent at exact source.');
  }
  return { status: 'validated', requestDigest: digest(request), checkpointDigest: request.checkpointDigest,
    receiptDigest: digest(['checkpoint', request]) };
}

function verifyParticipantCheckpoint(request) {
  verifyFiles(request.sourceSnapshot);
  if (!same(request.query, fixture.QUERY) || !same(request.targetSnapshot, fixture.TARGET)) {
    throw new Error('MORPH demo participant checkpoint binding mismatch.');
  }
  return { status: 'validated', requestDigest: digest(request), receiptDigest: digest(['checkpoint', request]) };
}

function authorizeParticipant({ action, request }) {
  if (action === 'bootstrap') return principal === 'supervisor' && same(request.snapshot, fixture.SOURCE);
  if (action === 'readMessage') return same(principal, request.reader);
  if (action === 'act') return same(principal, request.actor);
  return same(principal, fixture.COORDINATOR);
}

const runtime = role === 'coordinator' ? new MorphCoordinator({ dbPath: path.join(directory, 'state.sqlite'),
  authorize: message => same(principal, message.sender) && same(message.scope, fixture.SCOPE),
  verifyCheckpoint: verifyCoordinatorCheckpoint,
  verifyReady: request => rpc(request.participant.agentId, 'readyReceipt', request.query),
  verifyApplied: request => rpc(request.participant.agentId, 'receipt', request.query),
}) : new MorphParticipant({ dbPath: path.join(directory, 'state.sqlite'), participantId: identity,
  authorize: authorizeParticipant, verifyCheckpoint: verifyParticipantCheckpoint,
  verifyDecision: query => rpc('coordinator', 'decision', query) });

async function dispatch(request) {
  principal = request.principal;
  if (request.action === 'bootstrap') return runtime.bootstrap({ scope: fixture.SCOPE, version: 1 }, fixture.SOURCE);
  if (request.action === 'state') return runtime.state(fixture.PLAN.transitionId);
  const actions = { apply: () => runtime.apply(request.value), decision: () => runtime.decision(request.value),
    status: () => runtime.status(request.value), readyReceipt: () => runtime.readyReceipt(request.value),
    receipt: () => runtime.receipt(request.value), quiesce: () => runtime.quiesce(request.value),
    prepare: () => runtime.prepare(request.value), commit: () => runtime.commit(request.value),
    abort: () => runtime.abort(request.value), act: () => runtime.act(request.value),
    readMessage: () => runtime.readMessage(request.value), canVerify: () => runtime.canVerify(request.value) };
  if (!Object.hasOwn(actions, request.action)) throw new Error('Unknown MORPH demo action.');
  return actions[request.action]();
}

function read(request) {
  const actions = { decision: () => runtime.decision(request.value), status: () => runtime.status(request.value),
    readyReceipt: () => runtime.readyReceipt(request.value), receipt: () => runtime.receipt(request.value) };
  return actions[request.action]();
}

async function respond(request, operation) {
  try { process.send({ id: request.id, value: await operation(request) }); }
  catch (error) { process.send({ id: request.id, error: error.message }); }
}

let queue = Promise.resolve();
process.on('message', request => {
  if (request.rpcResponse) {
    const response = request.rpcResponse;
    const handler = pending.get(response.id);
    pending.delete(response.id);
    if (response.error) handler.reject(new Error(response.error));
    else handler.resolve(response.value);
    return;
  }
  if (['decision', 'status', 'readyReceipt', 'receipt'].includes(request.action)) {
    void respond(request, read);
    return;
  }
  queue = queue.then(() => respond(request, dispatch));
});
process.on('disconnect', () => { runtime.close(); process.exit(0); });
process.send({ id: 'ready', value: { pid: process.pid } });
