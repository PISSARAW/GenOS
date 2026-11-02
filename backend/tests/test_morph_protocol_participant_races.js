'use strict';

const assert = require('node:assert/strict');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const f = require('./helpers/morphParticipantFixture');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function revokedCheckpoint() {
  let granted = true;
  const node = f.runtime({ authorize: async () => granted, verifyCheckpoint: async request => {
    assert.throws(() => { request.sourceSnapshot.topology = 'forged'; }, TypeError);
    granted = false;
    return f.checkpoint(request);
  } });
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, f.plan().sourceSnapshot);
    await assert.rejects(node.prepare(f.request()), /authorization rejected or revoked/);
    assert.equal(node.status({ scope: f.scope }).phase, 'quiesced');
    assert.equal(node.readyReceipt(f.query()), null);
  } finally { node.close(); }
}

async function checkpointRacesAbort() {
  const entered = deferred();
  const release = deferred();
  const node = f.runtime({ verifyCheckpoint: async request => {
    entered.resolve(); await release.promise; return f.checkpoint(request);
  }, verifyDecision: async query => f.decision(query, 'ABORT') });
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, f.plan().sourceSnapshot);
    const preparing = node.prepare(f.request());
    await entered.promise;
    await node.abort(f.query());
    release.resolve();
    await assert.rejects(preparing, /state changed/);
    assert.equal(node.status({ scope: f.scope }).phase, 'active');
    assert.equal(node.readyReceipt(f.query()), null);
  } finally { release.resolve(); node.close(); }
}

async function inputMutation() {
  const entered = deferred();
  const release = deferred();
  const observed = [];
  const node = f.runtime({ authorize: async value => { observed.push(value); return true; },
    verifyCheckpoint: async request => { entered.resolve(); await release.promise; return f.checkpoint(request); } });
  const request = f.request();
  const before = digest(request);
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, request.plan.sourceSnapshot);
    const preparing = node.prepare(request);
    await entered.promise;
    request.plan.targetSnapshot.topology = 'corrupted';
    request.missionId = 'foreign';
    release.resolve();
    await preparing;
    const authorization = observed.find(value => value.action === 'prepare');
    assert.equal(digest(authorization.request), before);
    assert.equal(node.status({ scope: f.scope }).transition.plan.targetSnapshot.topology, 'trinity');
    assert.throws(() => { node.participant.agentId = 'forged'; }, TypeError);
    assert.throws(() => { node.participant = f.actor('forged'); }, TypeError);
  } finally { release.resolve(); node.close(); }
}

async function dependencyClosure() {
  const node = f.runtime();
  const plan = f.plan();
  for (const snapshot of [plan.sourceSnapshot, plan.targetSnapshot]) {
    snapshot.provenance.forEach(item => { item.content.origins = [`independent:${item.agentId}`]; });
    snapshot.dependencies = [
      { dependencyId: 'edge-one', content: { agentIds: ['agent-b', 'external-shared-origin'] } },
      { dependencyId: 'edge-two', content: { agentIds: ['external-shared-origin', 'agent-c'] } },
    ];
  }
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, plan.sourceSnapshot);
    const result = await node.canVerify(f.verification());
    assert.equal(result.independentGroups, 1);
    assert.equal(result.allowed, false);
    await node.prepare(f.request(plan));
    await node.commit(f.query(plan));
    assert.equal((await node.canVerify(f.verification())).allowed, false);
    assert.equal((await node.canVerify(f.verification({ verifierIds: ['agent-b'] }))).allowed, false);
  } finally { node.close(); }
}

async function foreignDecision() {
  const node = f.runtime({ verifyDecision: async query => f.decision({ ...query, missionId: 'foreign' }) });
  try {
    await node.bootstrap({ scope: f.scope, version: 1 }, f.plan().sourceSnapshot);
    await node.prepare(f.request());
    await assert.rejects(node.commit(f.query()), /decision binding mismatch/);
    assert.equal(node.status({ scope: f.scope }).version, 1);
    assert.equal(node.status({ scope: f.scope }).phase, 'prepared');
  } finally { node.close(); }
}

async function run() {
  await revokedCheckpoint();
  await checkpointRacesAbort();
  await inputMutation();
  await dependencyClosure();
  await foreignDecision();
  console.log('MORPH participant checkpoint races, revocation, immutable inputs and dependency closure: PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
