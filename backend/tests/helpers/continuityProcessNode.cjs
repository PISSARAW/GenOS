'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { ContinuityHandoff } = require('../../src/services/continuityProtocol/handoff');
const { FencedResource } = require('../../src/services/continuityProtocol/fence');
const fixture = require('./continuityProcessFixtures.cjs');

const [role, directory] = process.argv.slice(2);
const self = fixture.actor(role === 'old' ? fixture.SOURCE : fixture.SUCCESSOR);
let principal;
let stallActivation = false;
let resourceSequence = 0;
const resourcePending = new Map();
const same = (left, right) => digest(left) === digest(right);

function resourceCall(action, value) {
  const id = ++resourceSequence;
  return new Promise((resolve, reject) => {
    resourcePending.set(id, { resolve, reject });
    process.send({ resource: true, id, action, value });
  });
}

function authorizeResource({ action, request }) {
  if (action === 'bootstrap') return principal === 'controller' && same(request, fixture.bootstrap());
  if (action === 'transfer') return same(principal, fixture.actor(fixture.SUCCESSOR)) && same(request, fixture.TRANSFER);
  return same(principal, request.actor) && request.cost === 1 && request.resourceId === 'protected-note';
}

function verifyCheckpoint(request) {
  const checkpoint = JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.json'), 'utf8'));
  if (digest(checkpoint) !== request.bundle.checkpoint.digest || !same(request.bundle, fixture.BUNDLE) ||
      !same(request.source, fixture.SOURCE) || !same(request.successor, fixture.SUCCESSOR)) {
    throw new Error('CONTINUITY demo checkpoint binding mismatch.');
  }
  return { status: 'validated', transferId: request.transferId, bundleDigest: request.bundleDigest,
    checkpointDigest: digest(checkpoint), sourceHistoryDigest: checkpoint.historyDigest,
    requestDigest: digest(request), receiptDigest: digest(['checkpoint', request]) };
}

async function activateAuthority(request) {
  const receipt = await resourceCall('transfer', request);
  if (stallActivation) {
    process.send({ milestone: 'authority-transferred' });
    await new Promise(() => {});
  }
  return receipt;
}

const runtime = role === 'resource' ? new FencedResource({ dbPath: path.join(directory, 'resource.sqlite'),
  authorize: authorizeResource }) : new ContinuityHandoff({ dbPath: path.join(directory, 'handoff.sqlite'),
  authorize: message => same(message.sender, self), verifyCheckpoint, activateAuthority });

async function dispatch(request) {
  principal = request.principal;
  if (request.action === 'apply') return runtime.apply(request.value);
  if (request.action === 'state') return runtime.state(request.value);
  if (request.action === 'history') return runtime.history();
  if (request.action === 'armCrash') { stallActivation = true; return true; }
  if (request.action === 'write') return resourceCall('execute', { ...request.value, ...fixture.CONTEXT,
    actor: self, generation: role === 'old' ? 1 : 2 });
  if (request.action === 'rawWrite') return resourceCall('execute', request.value);
  const resourceActions = { bootstrap: () => runtime.bootstrap(request.value), transfer: () => runtime.transfer(request.value),
    execute: () => runtime.execute(request.value), authority: () => runtime.authority(request.value),
    effects: () => runtime.effects(request.value) };
  if (role !== 'resource' || !resourceActions[request.action]) throw new Error('Unknown CONTINUITY demo action.');
  return resourceActions[request.action]();
}

let queue = Promise.resolve();
process.on('message', request => {
  if (request.resourceResponse) {
    const response = request.resourceResponse;
    const pending = resourcePending.get(response.id);
    resourcePending.delete(response.id);
    if (response.error) pending.reject(new Error(response.error));
    else pending.resolve(response.value);
    return;
  }
  queue = queue.then(async () => {
    try { process.send({ id: request.id, value: await dispatch(request) }); }
    catch (error) { process.send({ id: request.id, error: error.message }); }
  });
});
process.on('disconnect', () => { runtime.close(); process.exit(0); });
process.send({ id: 'ready', value: { pid: process.pid } });
