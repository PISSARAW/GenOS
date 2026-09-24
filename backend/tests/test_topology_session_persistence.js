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
  if (statement.startsWith('INSERT INTO TOPOLOGY_SESSION_EVENTS')) return insertEvent(state.events, params);
  if (statement.startsWith('UPDATE TOPOLOGY_SESSIONS')) return updateSession(state.rows, statement, params);
  if (statement.startsWith('DELETE')) return deleteSession(state.rows, params);
  return { changes: 0 };
}

function insertSession(rows, statement, params) {
  const current = rows.get(params[0]);
  const revision = statement.includes('VALUES (?, ?, ?, 1') ? 1 : (current?.revision || 0) + (current ? 1 : 0);
  rows.set(params[0], { topology: params[1], state_json: params[2], revision });
  return { changes: 1 };
}

function insertEvent(events, params) {
  events.push(eventRow(params));
  return { changes: 1 };
}

function updateSession(rows, params) {
  const current = rows.get(params[2]);
  if (!current || current.revision !== params[3]) return { changes: 0 };
  rows.set(params[2], { ...current, state_json: params[0], revision: params[1] });
  return { changes: 1 };
}

function deleteSession(rows, params) {
  rows.delete(params[0]);
  return { changes: 1 };
}

function fakeDb() {
  const state = { rows: new Map(), events: [] };
  return {
    run: async (sql, ...params) => runStatement(state, sql, params),
    get: async (sql, ...params) => state.rows.get(params[0]),
    all: async (sql, ...params) => String(sql).includes('topology_session_events')
      ? state.events.filter((event) => event.session_id === params[0]).sort((a, b) => a.revision - b.revision)
      : [{ name: 'revision' }]
  };
}

(async () => {
  const db = fakeDb();

  const syn = await syncytium.createSession('Shared state session.', { db });
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

  const snap = await tools.applyTopologyOperation(db, { session_id: syn.sessionId, operation: 'snapshot' });
  assert.equal(snap.shared.textContent, 'shared');
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
  const ecoRecord = await store.load(db, eco.sessionId);
  assert.equal(ecoRecord.topology, 'biome');
  assert.equal(ecoRecord.state.matrix.version, 1);
  const ecoSnapshot = await tools.applyTopologyOperation(db, { session_id: eco.sessionId, operation: 'snapshot' });
  assert.equal(ecoSnapshot.entries[0].kind, 'resource_allocation');

  await assert.rejects(() => tools.applyTopologyOperation(db, { session_id: 'nope', operation: 'snapshot' }), /Unknown topology session/);
  console.log('Topology session persistence checks: PASS');
})().catch((error) => {
  console.error('Topology session persistence test failed:', error);
  process.exit(1);
});
