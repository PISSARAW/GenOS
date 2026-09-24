'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const conflicts = require('../src/services/syncytium/conflicts/semanticConflictService');

function concurrentWrite({ opId, actorId, key, type, action, value }) {
  return {
    opId, actorId, schemaVersion: 1, fieldType: type,
    causalContext: {}, dot: { actorId, sequence: 1 },
    kind: { type: action === 'assign' && type === 'LWW_REGISTER' ? 'set_field' : 'typed_field', key, action, value }
  };
}

async function main() {
  await assertScalarWriteConflict();
  await assertConcurrentMergeSurvives();
  await assertStateTransitionConflict();
  await assertAuthorityConflict();
  assertDetectorCategories();
}

async function assertScalarWriteConflict() {
  const session = await syncytium.createSession('Conflicting scalar writes.', {
    schema: { fields: [{ path: 'api.version', dataType: 'LWW_REGISTER' }] }
  });
  const first = concurrentWrite({ opId: 'scalar-a', actorId: 'A', key: 'api.version', type: 'LWW_REGISTER', action: 'assign', value: 'v1' });
  const second = concurrentWrite({ opId: 'scalar-b', actorId: 'B', key: 'api.version', type: 'LWW_REGISTER', action: 'assign', value: 'v2' });
  await syncytium.applyOperation(session.sessionId, first);
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, second),
    (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT' && error.conflicts.some((item) => item.type === 'WRITE_CONFLICT'));
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.logSize, 1);
}

async function assertConcurrentMergeSurvives() {
  const session = await syncytium.createSession('Concurrent multi value updates.', {
    schema: { fields: [{ path: 'claims.owner', dataType: 'MV_REGISTER' }] }
  });
  const left = concurrentWrite({ opId: 'claim-a', actorId: 'A', key: 'claims.owner', type: 'MV_REGISTER', action: 'assign', value: 'A' });
  const right = concurrentWrite({ opId: 'claim-b', actorId: 'B', key: 'claims.owner', type: 'MV_REGISTER', action: 'assign', value: 'B' });
  await syncytium.applyOperation(session.sessionId, left);
  const merged = await syncytium.applyOperation(session.sessionId, right);
  assert.deepEqual(merged.snapshot.sharedFields['claims.owner'].sort(), ['A', 'B']);
}

async function assertStateTransitionConflict() {
  const session = await syncytium.createSession('Competing state transitions.', {
    schema: { fields: [{
      path: 'deployment.status', dataType: 'STATE_MACHINE',
      allowedTransitions: [{ from: 'draft', to: 'ready' }, { from: 'draft', to: 'cancelled' }]
    }] }
  });
  const first = concurrentWrite({ opId: 'state-a', actorId: 'A', key: 'deployment.status', type: 'STATE_MACHINE', action: 'transition', value: 'ready' });
  first.kind = { type: 'typed_field', key: 'deployment.status', action: 'transition', from: 'draft', to: 'ready' };
  const second = concurrentWrite({ opId: 'state-b', actorId: 'B', key: 'deployment.status', type: 'STATE_MACHINE', action: 'transition', value: 'cancelled' });
  second.kind = { type: 'typed_field', key: 'deployment.status', action: 'transition', from: 'draft', to: 'cancelled' };
  await syncytium.applyOperation(session.sessionId, first);
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, second),
    (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT' && error.conflicts.some((item) => item.type === 'STATE_MACHINE_CONFLICT'));
}

async function assertAuthorityConflict() {
  const session = await syncytium.createSession('Delegated concurrent writes.', {
    schema: { fields: [{ path: 'api.security', dataType: 'LWW_REGISTER', ownerDomain: 'backend' }] },
    nuclearDomains: [
      { domainId: 'backend', members: ['backend-agent'], owns: ['api.*'] },
      { domainId: 'security', members: ['security-agent'], mayWrite: ['api.security'] }
    ]
  });
  const first = concurrentWrite({ opId: 'authority-a', actorId: 'backend-agent', key: 'api.security', type: 'LWW_REGISTER', action: 'assign', value: 'safe' });
  first.domainId = 'backend';
  const second = concurrentWrite({ opId: 'authority-b', actorId: 'security-agent', key: 'api.security', type: 'LWW_REGISTER', action: 'assign', value: 'changed' });
  second.domainId = 'security';
  await syncytium.applyOperation(session.sessionId, first);
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, second),
    (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT' && error.conflicts.some((item) => item.type === 'AUTHORITY_CONFLICT'));
}

function assertDetectorCategories() {
  const prior = {
    opId: 'dep-a', actorId: 'A', schemaVersion: 1, causalContext: {}, dot: { actorId: 'A', sequence: 1 },
    intent: { goalId: 'remove-api' },
    kind: { type: 'set_field', key: 'api.contract', value: 'old' }
  };
  const candidate = {
    opId: 'dep-b', actorId: 'B', causalContext: {}, dot: { actorId: 'B', sequence: 1 },
    intent: { dependencies: ['api.contract'], goalId: 'replace', conflictsWith: ['remove-api'] }, domainId: 'security',
    schemaVersion: 2, kind: { type: 'set_field', key: 'api.caller', value: 'new' }
  };
  const found = conflicts.detectCandidate({ operation: candidate, history: [prior], schema: { fields: {} }, domains: {} });
  assert.ok(found.some((item) => item.type === 'DEPENDENCY_CONFLICT'));
  assert.ok(found.some((item) => item.type === 'SCHEMA_CONFLICT'));
  assert.ok(found.some((item) => item.type === 'INTENT_CONFLICT'));
}

main().then(() => console.log('Syncytium semantic conflict checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
