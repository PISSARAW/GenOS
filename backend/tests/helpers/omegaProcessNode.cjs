'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { validateMessage } = require('../../src/services/omegaProtocol/contract');
const { OmegaEffectResource } = require('../../src/services/omegaProtocol/resource');
const { createExecutor, evidence } = require('./omegaProcessRuntime.cjs');
const fixture = require('./omegaProcessFixtures.cjs');

const [role, directory] = process.argv.slice(2);
const same = (left, right) => digest(left) === digest(right);
let principal;
let stall = false;
let sequence = 0;
const pending = new Map();

function rpc(peer, action, value) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject }); process.send({ rpc: true, id, peer, action, value });
  });
}

async function dispatchEffect(request) {
  const result = await rpc('resource', 'execute', request);
  if (stall) {
    process.send({ milestone: 'external-effect-applied' });
    await new Promise(() => {});
  }
  return result;
}

function resourceAuthorization({ action, request }) {
  if (action === 'bootstrap') return principal === 'supervisor' && same(request, fixture.bootstrap());
  return same(principal, fixture.EXECUTOR) && same(request.actor, fixture.CLIENT) && same(request.scope, fixture.SCOPE);
}

const resource = role === 'resource' ? new OmegaEffectResource({ dbPath: path.join(directory, 'resource.sqlite'),
  authorize: resourceAuthorization, verifyEvidence: evidence }) : null;
const runtime = role === 'executor' ? createExecutor({ directory, principal: () => principal,
  rpc, dispatch: dispatchEffect }) : null;
const outbox = role === 'client' ? new Database(path.join(directory, 'outbox.sqlite')) : null;
if (outbox) {
  outbox.pragma('journal_mode = WAL');
  outbox.exec('CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,message TEXT NOT NULL,result TEXT)');
}

async function send(message) {
  const value = validateMessage(message);
  const prior = outbox.prepare('SELECT fingerprint,result FROM messages WHERE id=?').get(value.messageId);
  if (prior && prior.fingerprint !== digest(value)) throw new Error('OMEGA client outbox conflict.');
  if (prior?.result) return JSON.parse(prior.result);
  outbox.prepare('INSERT OR IGNORE INTO messages(id,fingerprint,message) VALUES (?,?,?)')
    .run(value.messageId, digest(value), JSON.stringify(value));
  const result = await rpc('executor', 'envelope', value);
  outbox.prepare('UPDATE messages SET result=? WHERE id=?').run(JSON.stringify(result), value.messageId);
  return result;
}

async function envelope(input) {
  const message = validateMessage(input);
  if (!runtime.authorize(message)) throw new Error('OMEGA demo authenticated actor or scope mismatch.');
  if (['DESCRIBE_RUNTIME', 'SUBMIT_PROGRAM', 'ACCEPT_PLAN'].includes(message.type)) return runtime.admission.apply(message);
  if (['EXECUTE', 'RESUME', 'REPORT_OBLIGATIONS'].includes(message.type)) return runtime.execution.apply(message);
  if (message.type !== 'RECONCILE_EFFECT') throw new Error('OMEGA demo effect message is not client-executable.');
  const state = runtime.gate.state({ effectKey: message.payload.effectKey });
  const request = state?.request;
  if (!request || !same(request.scope, message.scope) || request.missionId !== message.missionId ||
      request.conversationId !== message.conversationId || !same(request.actor, message.sender)) {
    throw new Error('OMEGA demo reconciliation scope mismatch.');
  }
  return runtime.gate.reconcileEffect(message.payload);
}

function diagnostics(request) {
  if (request.principal !== 'supervisor') throw new Error('OMEGA diagnostic access denied.');
  if (request.action === 'counters') return runtime.counters();
  if (request.action === 'runState') return runtime.execution.state(fixture.RUN_QUERY);
  if (request.action === 'gateState') {
    const effect = runtime.effectRequest();
    return effect ? runtime.gate.state({ effectKey: effect.effectKey }) : null;
  }
  if (request.action === 'effects') return resource.effects(fixture.SCOPE);
  return resource.authority(fixture.SCOPE);
}

async function dispatch(request) {
  principal = request.principal;
  if (request.action === 'armCrash' && principal === 'supervisor') { stall = true; return true; }
  const actions = { send: () => send(request.value), envelope: () => envelope(request.value),
    bootstrap: () => resource.bootstrap(request.value), execute: () => resource.execute(request.value),
    reconcile: () => resource.reconcile(request.value) };
  if (!Object.hasOwn(actions, request.action)) throw new Error('Unknown OMEGA demo action.');
  return actions[request.action]();
}

async function respond(request, callback) {
  try { process.send({ id: request.id, value: await callback(request) }); }
  catch (error) { process.send({ id: request.id, error: error.message }); }
}

let queue = Promise.resolve();
process.on('message', request => {
  if (request.rpcResponse) {
    const response = request.rpcResponse;
    const callback = pending.get(response.id); pending.delete(response.id);
    if (response.error) callback.reject(new Error(response.error)); else callback.resolve(response.value);
    return;
  }
  if (['counters', 'runState', 'gateState', 'effects', 'authority'].includes(request.action)) {
    void respond(request, diagnostics); return;
  }
  queue = queue.then(() => respond(request, dispatch));
});
process.on('disconnect', () => {
  runtime?.close(); resource?.close(); outbox?.close(); process.exit(0);
});
process.send({ id: 'ready', value: { pid: process.pid } });
