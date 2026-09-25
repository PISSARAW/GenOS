const assert = require('node:assert/strict');
const store = require('../src/services/topologySessionStore');
const syncytium = require('../src/services/syncytiumCoordinationService');
const rhizome = require('../src/services/rhizomeCoordinationService');
const biome = require('../src/services/biomeCoordinationService');
const tools = require('../src/services/topologySessionTools');

function eventRow(params) {
  return { session_id: params[0], topology: params[1], revision: params[2], event_type: params[3], payload_json: params[4] };
}

function runStatement(state, sql, params) {
  const statement = String(sql).trim().toUpperCase();
  if (statement.startsWith('INSERT INTO TOPOLOGY_SESSIONS')) return insertSession(state.rows, statement, params);
  if (statement.includes('RHIZOME_NODES')) return updateRhizomeRows({ rows: state.rhizomeNodes, statement, params, kind: 'node' });
  if (statement.includes('RHIZOME_EDGES')) return updateRhizomeRows({ rows: state.rhizomeEdges, statement, params, kind: 'edge' });
  if (statement.startsWith('UPDATE TOPOLOGY_SESSIONS')) return updateSession(state.rows, statement, params);
  if (statement.includes('SYNCYTIUM')) return runSyncytiumStatement(state, statement, params);
  if (statement.startsWith('INSERT INTO TOPOLOGY_SESSION_EVENTS')) return insertEvent(state.events, statement, params);
  if (statement.startsWith('DELETE')) return deleteSession(state.rows, params);
  return { changes: 0 };
}

function runSyncytiumStatement(state, statement, params) {
  if (statement.startsWith('INSERT INTO SYNCYTIUM_SESSION_REVISIONS')) {
    state.syncytiumRevisions.set(params[0], params[1] ?? 0);
    return { changes: 1 };
  }
  if (statement.startsWith('UPDATE')) return updateRevision(state.syncytiumRevisions, params);
  state.syncytiumOps.add(`${params[0]}:${params[1]}`);
  return { changes: 1 };
}

function updateRhizomeRows({ rows, statement, params, kind }) {
  if (statement.startsWith('DELETE')) {
    const retained = rows.filter((row) => row.session_id !== params[0]);
    rows.splice(0, rows.length, ...retained);
  } else {
    const suffix = kind === 'node' ? 'node' : 'edge';
    rows.push({ session_id: params[0], [`${suffix}_id`]: params[1], graph_version: params[2], [`${suffix}_json`]: params[3] });
  }
  return { changes: 1 };
}

function insertSession(rows, statement, params) {
  if (statement.includes("VALUES (?, 'BIOME', ?")) {
    rows.set(params[0], { topology: 'biome', state_json: params[1], revision: 0 });
    return { changes: 1 };
  }
  const current = rows.get(params[0]);
  const revision = statement.includes('VALUES (?, ?, ?, 1') ? 1 : (current?.revision || 0) + (current ? 1 : 0);
  rows.set(params[0], { topology: params[1], state_json: params[2], revision });
  return { changes: 1 };
}

function insertEvent(events, statement, params) {
  if (statement.includes("VALUES (?, 'BIOME', ?")) {
    events.push({ session_id: params[0], topology: 'biome', revision: params[1], event_type: params[2], payload_json: params[3] });
    return { changes: 1 };
  }
  events.push(eventRow(params));
  return { changes: 1 };
}

function updateSession(rows, statement, params) {
  const isSave = statement.includes('SET TOPOLOGY = ?');
  const isSyncytium = statement.includes("TOPOLOGY = 'SYNCYTIUM'");
  const idIndex = isSyncytium ? 1 : isSave ? 3 : 2;
  const revisionIndex = params.length === 4 ? 3 : 4;
  const current = rows.get(params[idIndex]);
  if (!current || (!isSyncytium && current.revision !== params[revisionIndex])) return { changes: 0 };
  const revision = isSyncytium ? current.revision : params[1];
  rows.set(params[idIndex], { ...current, state_json: params[0], revision });
  return { changes: 1 };
}

function updateRevision(revisions, params) {
  const [revision, sessionId, expected] = params;
  if (revisions.get(sessionId) !== expected) return { changes: 0 };
  revisions.set(sessionId, revision);
  return { changes: 1 };
}

function deleteSession(rows, params) {
  rows.delete(params[0]);
  return { changes: 1 };
}

function fakeDb() {
  const state = { rows: new Map(), events: [], rhizomeNodes: [], rhizomeEdges: [], syncytiumRevisions: new Map(), syncytiumOps: new Set() };
  return {
    run: async (sql, ...params) => runStatement(state, sql, params),
    get: async (sql, ...params) => readRecord(state, sql, params),
    all: async (sql, ...params) => readRows(state, sql, params)
  };
}

function readRows(state, sql, params) {
  const statement = String(sql);
  if (statement.includes('topology_session_events')) return state.events.filter((event) => event.session_id === params[0]).sort((a, b) => a.revision - b.revision);
  if (statement.includes('FROM rhizome_nodes')) return state.rhizomeNodes.filter((row) => row.session_id === params[0]);
  if (statement.includes('FROM rhizome_edges')) return state.rhizomeEdges.filter((row) => row.session_id === params[0]);
  return [{ name: 'revision' }];
}

function readRecord(state, sql, params) {
  const statement = String(sql).toUpperCase();
  if (statement.includes('SYNCYTIUM_SESSION_REVISIONS')) return { revision: state.syncytiumRevisions.get(params[0]) };
  if (statement.includes('SYNCYTIUM_APPLIED_OPS')) return state.syncytiumOps.has(`${params[0]}:${params[1]}`) ? { op_id: params[1] } : null;
  return state.rows.get(params[0]);
}

(async () => {
  const db = fakeDb();

  const syn = await syncytium.createSession('Shared state session.', {
    db,
    schema: { schemaId: 'test-session', schemaVersion: 1, fields: [{ path: 'mcp.status', dataType: 'LWW_REGISTER' }] }
  });
  await syncytium.applyOperation(syn.sessionId, { agentId: 'w1', role: 'r', kind: { type: 'insert_text', index: 0, text: 'shared' } }, { db });
  const synRecord = await store.load(db, syn.sessionId);
  assert.equal(synRecord.topology, 'syncytium');
  assert.equal(synRecord.state.ops.length, 1);
  const revivedSyn = syncytium.rehydrate(synRecord);
  assert.equal(revivedSyn.crdt.getSnapshot().textContent, 'shared');

  const rhiz = await rhizome.composeRhizome('Stigmergy session.', { db });
  await rhizome.depositTrail(rhiz.sessionId, 'edge:e1', { amount: 4, db });
  const rhizRecord = await store.load(db, rhiz.sessionId);
  assert.equal(rhizRecord.topology, 'rhizome');
  assert.equal(rhizRecord.revision, 2);
  assert.equal(rhizRecord.state.trails.length, 1);
  assert.deepEqual((await store.events(db, rhiz.sessionId)).map((event) => event.type), ['SESSION_CREATED', 'TRAIL_DEPOSITED']);
  const revivedRhiz = rhizome.rehydrate(rhizRecord);
  assert.ok(revivedRhiz.matrix.getDecayedIntensity('edge:e1') > 0);

  const graphNodes = [
    { nodeId: 'parser', kind: 'AGENT', capabilities: ['json_parse'], state: 'ACTIVE' },
    { nodeId: 'validator', kind: 'AGENT', capabilities: ['json_schema_validate'], state: 'ACTIVE' },
    { nodeId: 'explainer', kind: 'AGENT', capabilities: ['json_error_explain'], state: 'ACTIVE' }
  ];
  for (const node of graphNodes) {
    await tools.applyTopologyOperation(db, { session_id: rhiz.sessionId, operation: 'add_node', node });
  }
  const graphEdges = [
    { edgeId: 'parser-validator', from: 'parser', to: 'validator', relation: 'ROUTES_TO', status: 'ACTIVE' },
    { edgeId: 'validator-explainer', from: 'validator', to: 'explainer', relation: 'ROUTES_TO', status: 'ACTIVE' }
  ];
  for (const edge of graphEdges) {
    await tools.applyTopologyOperation(db, { session_id: rhiz.sessionId, operation: 'add_edge', edge });
  }
  const route = await tools.applyTopologyOperation(db, {
    session_id: rhiz.sessionId, operation: 'route',
    need: { needId: 'schema-check', capability: 'json_schema_validate' }
  });
  assert.equal(route.selected, true);
  assert.deepEqual(route.route.nodeIds, ['parser', 'validator']);
  assert.deepEqual(route.route.edgeIds, ['parser-validator']);

  const snap = await tools.applyTopologyOperation(db, { session_id: syn.sessionId, operation: 'snapshot' });
  assert.equal(snap.shared.textContent, 'shared');
  const mcpOperation = {
    opId: 'mcp-field-op', actorId: 'w1',
    kind: { type: 'set_field', key: 'mcp.status', value: 'ready' }
  };
  await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'apply', op: mcpOperation
  });
  assert.ok((await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'schema'
  })).schema);
  assert.ok((await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'domains'
  })).domains);
  const history = await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'history'
  });
  assert.ok(history.operations.some((operation) => operation.opId === 'mcp-field-op'));
  const explanation = await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'explain', path: 'mcp.status', version: 'mcp-field-op'
  });
  assert.equal(explanation.operation.opId, 'mcp-field-op');
  assert.deepEqual(await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'conflicts', op: mcpOperation
  }), []);
  assert.ok((await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'invariants'
  })).definitions);
  assert.ok(Array.isArray(await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'replicas'
  })));
  assert.ok((await tools.applyTopologyOperation(db, {
    session_id: syn.sessionId, operation: 'health'
  })).consistency);
  const deposit = await tools.applyTopologyOperation(db, { session_id: rhiz.sessionId, operation: 'deposit', marker: 'edge:e2', amount: 2 });
  assert.equal(deposit.trail.intensity, 2);

  const eco = await biome.composeBiome('Persistent environment session.', { db });
  const allocation = await tools.applyTopologyOperation(db, {
    session_id: eco.sessionId,
    operation: 'allocate',
    populations: [{ id: 'pollinators', demand: 2, priority: 1 }],
    total_budget: 80
  });
  assert.equal(allocation.allocations[0].budget, 80);
  assert.equal(allocation.receipt.previousRevision, 0);
  assert.equal(allocation.receipt.resultingRevision, 1);
  const ecoRecord = await store.load(db, eco.sessionId);
  assert.equal(ecoRecord.topology, 'biome');
  assert.equal(ecoRecord.state.matrix.version, 1);
  const biomeEvents = await store.events(db, eco.sessionId);
  assert.equal(biomeEvents.length, 1);
  assert.equal(biomeEvents[0].payload.actorId, 'system');
  await assert.rejects(
    () => store.save(db, { id: eco.sessionId, topology: 'biome', revision: 0, state: {} }),
    (error) => error.code === 'TOPOLOGY_SESSION_CONFLICT'
  );
  assert.equal((await store.load(db, eco.sessionId)).state.matrix.version, 1);
  const ecoSnapshot = await tools.applyTopologyOperation(db, { session_id: eco.sessionId, operation: 'snapshot' });
  assert.equal(ecoSnapshot.entries[0].kind, 'resource_allocation');

  await assert.rejects(() => tools.applyTopologyOperation(db, { session_id: 'nope', operation: 'snapshot' }), /Unknown topology session/);
  console.log('Topology session persistence checks: PASS');
})().catch((error) => {
  console.error('Topology session persistence test failed:', error);
  process.exit(1);
});
