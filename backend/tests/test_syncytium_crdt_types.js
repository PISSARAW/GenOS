'use strict';

const assert = require('node:assert/strict');
const crdt = require('../src/services/syncytiumCrdtTypeRegistry');
const { createSyncytiumCrdt } = require('../src/services/syncytiumCrdtService');

function operation({ opId, key, fieldType, action, payload = {}, rules = {} }) {
  return {
    opId, agentId: 'agent-' + opId, lamport: 1, fieldType,
    fieldRules: rules,
    kind: { type: 'typed_field', key, action, ...payload }
  };
}

function apply(fields, op) {
  crdt.apply(fields, op, op);
}

function main() {
  const fields = {};
  apply(fields, operation({ opId: 'lww-a', key: 'best', fieldType: 'LWW_REGISTER', action: 'assign', payload: { value: 1 } }));
  apply(fields, { ...operation({ opId: 'lww-b', key: 'best', fieldType: 'LWW_REGISTER', action: 'assign', payload: { value: 2 } }), lamport: 2 });
  assert.equal(crdt.materialize(fields).best, 2);

  apply(fields, operation({ opId: 'mv-a', key: 'choices', fieldType: 'MV_REGISTER', action: 'assign', payload: { value: 'A' } }));
  apply(fields, operation({ opId: 'mv-b', key: 'choices', fieldType: 'MV_REGISTER', action: 'assign', payload: { value: 'B' } }));
  assert.deepEqual(crdt.materialize(fields).choices.sort(), ['A', 'B']);

  apply(fields, operation({ opId: 'g-a', key: 'completed', fieldType: 'G_COUNTER', action: 'increment', payload: { delta: 3 } }));
  apply(fields, operation({ opId: 'g-b', key: 'completed', fieldType: 'G_COUNTER', action: 'increment', payload: { delta: 2 } }));
  apply(fields, operation({ opId: 'pn-a', key: 'balance', fieldType: 'PN_COUNTER', action: 'increment', payload: { delta: 5 } }));
  apply(fields, operation({ opId: 'pn-b', key: 'balance', fieldType: 'PN_COUNTER', action: 'increment', payload: { delta: -2 } }));
  assert.equal(crdt.materialize(fields).completed, 5);
  assert.equal(crdt.materialize(fields).balance, 3);

  apply(fields, operation({ opId: 'set-a', key: 'members', fieldType: 'ADD_WINS_SET', action: 'add', payload: { value: 'x' } }));
  apply(fields, operation({ opId: 'set-b', key: 'members', fieldType: 'ADD_WINS_SET', action: 'add', payload: { value: 'x' } }));
  apply(fields, operation({ opId: 'set-r', key: 'members', fieldType: 'ADD_WINS_SET', action: 'remove', payload: { value: 'x', observedTags: ['set-a'] } }));
  assert.deepEqual(crdt.materialize(fields).members, ['x']);

  apply(fields, operation({ opId: 'map-a', key: 'metadata', fieldType: 'MAP', action: 'set', payload: { entryKey: 'owner', value: 'Ada' } }));
  apply(fields, operation({ opId: 'map-b', key: 'metadata', fieldType: 'MAP', action: 'set', payload: { entryKey: 'count', value: 2 } }));
  assert.deepEqual(crdt.materialize(fields).metadata, { owner: 'Ada', count: 2 });

  apply(fields, operation({ opId: 'seq-a', key: 'steps', fieldType: 'SEQUENCE', action: 'insert', payload: { elementId: 'one', value: 'first' } }));
  apply(fields, operation({ opId: 'seq-b', key: 'steps', fieldType: 'SEQUENCE', action: 'insert', payload: { elementId: 'two', afterId: 'one', value: 'second' } }));
  assert.deepEqual(crdt.materialize(fields).steps, ['first', 'second']);

  const rules = { allowedTransitions: [{ from: 'draft', to: 'ready' }] };
  apply(fields, operation({ opId: 'state-a', key: 'status', fieldType: 'STATE_MACHINE', action: 'transition', payload: { from: 'draft', to: 'ready' }, rules }));
  assert.equal(crdt.materialize(fields).status, 'ready');
  assert.throws(() => apply(fields, operation({ opId: 'state-b', key: 'status', fieldType: 'STATE_MACHINE', action: 'transition', payload: { from: 'ready', to: 'draft' }, rules })),
    (error) => error.code === 'SYNCYTIUM_CRDT_OPERATION_INVALID');

  const replica = createSyncytiumCrdt();
  replica.applyOp(operation({ opId: 'integrated', key: 'score', fieldType: 'G_COUNTER', action: 'increment', payload: { delta: 4 } }));
  assert.equal(replica.getSnapshot().sharedFields.score, 4);
}

main();
console.log('Syncytium CRDT type checks: PASS');
