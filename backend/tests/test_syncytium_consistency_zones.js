'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const router = require('../src/services/syncytium/consistency/coordinationRouter');

async function main() {
  const session = await syncytium.createSession('Consistency zones.', {
    schema: { fields: [
      { path: 'presence.cursor', dataType: 'LWW_REGISTER', consistencyZone: 'EVENTUAL' },
      { path: 'claims.owner', dataType: 'MV_REGISTER', consistencyZone: 'CAUSAL' },
      { path: 'deployment.status', dataType: 'STATE_MACHINE', consistencyZone: 'SERIALIZABLE', allowedTransitions: [{ from: 'draft', to: 'ready' }] },
      { path: 'audit.items', dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      { path: 'release.digest', dataType: 'LWW_REGISTER', consistencyZone: 'IMMUTABLE' }
    ] }
  });

  const green = await syncytium.applyOperation(session.sessionId, {
    opId: 'presence-1', actorId: 'agent-a', kind: { type: 'set_field', key: 'presence.cursor', value: 4 }
  });
  assert.deepEqual(green.coordination, { zone: 'EVENTUAL', classification: 'GREEN', coordinationRequired: false });

  const amber = await syncytium.applyOperation(session.sessionId, {
    opId: 'claim-1', actorId: 'agent-a', kind: { type: 'typed_field', key: 'claims.owner', action: 'assign', value: 'A' }
  });
  assert.equal(amber.coordination.classification, 'AMBER');
  assert.equal(amber.coordination.coordinationRequired, true);

  const red = await syncytium.applyOperation(session.sessionId, {
    opId: 'deploy-1', actorId: 'agent-a', kind: { type: 'typed_field', key: 'deployment.status', action: 'transition', from: 'draft', to: 'ready' }
  });
  assert.equal(red.coordination.classification, 'RED');

  await syncytium.applyOperation(session.sessionId, {
    opId: 'audit-add', actorId: 'agent-a', kind: { type: 'typed_field', key: 'audit.items', action: 'add', value: 'verified' }
  });
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, {
    opId: 'audit-remove', actorId: 'agent-a', kind: { type: 'typed_field', key: 'audit.items', action: 'remove', value: 'verified', observedTags: ['audit-add'] }
  }), (error) => error.code === 'SYNCYTIUM_APPEND_ONLY_VIOLATION');

  await syncytium.applyOperation(session.sessionId, {
    opId: 'digest-1', actorId: 'agent-a', kind: { type: 'set_field', key: 'release.digest', value: 'sha256:abc' }
  });
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, {
    opId: 'digest-2', actorId: 'agent-a', kind: { type: 'set_field', key: 'release.digest', value: 'sha256:def' }
  }), (error) => error.code === 'SYNCYTIUM_IMMUTABLE_FIELD');

  await verifyRedSerialization();
}

async function verifyRedSerialization() {
  const held = deferred();
  const red = { coordinationRequired: true };
  const order = [];
  const first = router.run(red, 'serial-session', async () => {
    order.push('first-start');
    await held.promise;
    order.push('first-end');
  });
  const second = router.run(red, 'serial-session', async () => { order.push('second'); });
  await Promise.resolve();
  assert.deepEqual(order, ['first-start']);
  held.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

main().then(() => console.log('Syncytium consistency zone checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
