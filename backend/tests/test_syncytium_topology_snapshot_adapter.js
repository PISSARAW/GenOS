'use strict';

const assert = require('node:assert/strict');
const { createSyncytiumCrdt } = require('../src/services/syncytiumCrdtService');
const materialized = require('../src/services/syncytium/history/snapshotService');
const adapter = require('../src/services/syncytium/topologySnapshotAdapter');
const topologySnapshots = require('../src/services/topologySnapshotService');

function fixture(variantId) {
  const crdt = createSyncytiumCrdt();
  crdt.applyOp({ opId: 'op-1', actorId: 'agent-1', kind: { type: 'set_field', key: 'result', value: 1 } });
  const session = { sessionId: 'session-1', crdt, schema: { schemaVersion: 1 }, snapshots: [] };
  materialized.capture(session);
  const schemaFields = Object.fromEntries(adapter.FIELD_REQUIREMENTS[variantId]
    .map((field) => [field, { dataType: 'MAP' }]));
  if (variantId === 'hard') schemaFields.result = { dataType: 'LWW_REGISTER' };
  return { variantPolicy: { id: variantId }, schema: { fields: schemaFields },
    crdtState: crdt.serialize(), snapshots: session.snapshots, replicas: {},
    domains: variantId === 'hierarchical' ? { region: { members: ['agent-1'] } } : {} };
}

function database(state) {
  const data = { state, revision: 2, owner: 'session-1' };
  return { data, async get(sql, id) {
    if (sql.includes('FROM agents')) return id === 'agent-1'
      ? { workspace_id: 'workspace-1', metadata_json: JSON.stringify({ topologySessionId: data.owner }) } : null;
    if (sql.includes('FROM topology_sessions')) return id === 'session-1'
      ? { state_json: JSON.stringify(data.state), revision: data.revision } : null;
    throw new Error(`Unexpected query: ${sql}`);
  } };
}

async function main() {
  assert.equal(Object.keys(adapter.FIELD_REQUIREMENTS).length, 13);
  topologySnapshots.registerAdapter('syncytium', adapter);
  for (const variantId of Object.keys(adapter.FIELD_REQUIREMENTS)) {
    const db = database(fixture(variantId));
    const context = { db, agentId: 'agent-1', workspaceId: 'workspace-1', sessionId: 'session-1',
      scope: { clause: 'w.id = ?', params: ['workspace-1'] } };
    const manifest = await adapter.capture(context);
    assert.equal(manifest.components[0].status, 'reference-only', variantId);
    assert.equal(manifest.boundary.variantId, variantId);
    const preflight = await adapter.preflightRestore(context, manifest);
    assert.equal(preflight.ok, true, variantId);
    assert.equal(preflight.plan.sharedStateRestore, 'unsupported');
    const serviceContext = { ...context, topologyId: 'syncytium', variantId,
      scope: context.scope };
    const sealed = await topologySnapshots.capture(serviceContext);
    assert.equal((await topologySnapshots.preflightRestore({ ...serviceContext, manifest: sealed })).restorable,
      false, variantId);
    db.data.revision += 1;
    assert.deepEqual((await adapter.preflightRestore(context, manifest)).reasons,
      ['SYNCYTIUM_BOUNDARY_CHANGED']);
  }
  const db = database(fixture('transactional'));
  const context = { db, agentId: 'agent-1', workspaceId: 'workspace-1', sessionId: 'session-1',
    scope: { clause: 'w.id = ?', params: ['workspace-1'] } };
  const valid = await adapter.capture(context);
  db.data.owner = 'another-session';
  assert.equal((await adapter.capture(context)).components[0].status, 'conflict');
  db.data.owner = 'session-1';
  assert.equal((await adapter.capture({ ...context, workspaceId: 'other-workspace' })).components[0].status, 'conflict');
  assert.equal((await adapter.capture({ ...context, variantId: 'graph' })).components[0].status, 'conflict');
  db.data.state.replicas.pending = { status: 'PARTITIONED', offlineOperations: [{}] };
  assert.equal((await adapter.preflightRestore(context, valid)).ok, false);
  db.data.state.replicas = {};
  db.data.state.crdtState.operations.push({ opId: 'unmaterialized' });
  assert.equal((await adapter.capture(context)).components[0].status, 'conflict');
  db.data.state.crdtState = db.data.state.snapshots[0].crdtState;
  db.data.state.snapshots[0].causalFrontier = { forged: 1 };
  assert.equal((await adapter.capture(context)).components[0].status, 'conflict');
  console.log('Syncytium topology snapshot adapter: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
