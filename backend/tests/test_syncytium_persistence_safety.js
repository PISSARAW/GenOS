const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const persistence = require('../src/services/syncytiumPersistenceService');

function fakeDb() {
  const state = { rows: new Map(), revisions: new Map(), operations: new Set(), events: [] };
  return {
    run: async (sql, ...params) => runStatement(sql, params, state),
    get: async (sql, ...params) => readRow(sql, params, state),
    all: async (sql, ...params) => readRows(sql, params, state)
  };
}

function runStatement(sql, params, state) {
  const statement = String(sql).trim().toUpperCase();
  if (statement.startsWith('CREATE TABLE') || statement.startsWith('ALTER TABLE')) return { changes: 0 };
  if (statement.startsWith('INSERT INTO TOPOLOGY_SESSIONS')) {
    state.rows.set(params[0], { topology: params[1], state_json: params[2], revision: 1 });
    return { changes: 1 };
  }
  if (statement.startsWith('INSERT INTO SYNCYTIUM_SESSION_REVISIONS')) {
    state.revisions.set(params[0], params[1] ?? 0);
    return { changes: 1 };
  }
  if (statement.startsWith('UPDATE TOPOLOGY_SESSIONS')) return updateSession(params, state.rows);
  if (statement.startsWith('UPDATE SYNCYTIUM_SESSION_REVISIONS')) return updateRevision(params, state.revisions);
  if (statement.startsWith('INSERT INTO SYNCYTIUM_APPLIED_OPS')) {
    state.operations.add(`${params[0]}:${params[1]}`);
    return { changes: 1 };
  }
  if (statement.startsWith('INSERT INTO TOPOLOGY_SESSION_EVENTS')) {
    state.events.push({ session_id: params[0], topology: params[1], revision: params[2], event_type: params[3], payload_json: params[4] });
    return { changes: 1 };
  }
  return { changes: 0 };
}

function updateSession(params, rows) {
  const [state, id] = params;
  const current = rows.get(id);
  if (!current) return { changes: 0 };
  rows.set(id, { ...current, state_json: state });
  return { changes: 1 };
}

function updateRevision(params, revisions) {
  const [revision, id, expected] = params;
  if (revisions.get(id) !== expected) return { changes: 0 };
  revisions.set(id, revision);
  return { changes: 1 };
}

function readRow(sql, params, state) {
  if (String(sql).toUpperCase().includes('SYNCYTIUM_SESSION_REVISIONS')) return { revision: state.revisions.get(params[0]) };
  if (String(sql).toUpperCase().includes('SYNCYTIUM_APPLIED_OPS')) {
    return state.operations.has(`${params[0]}:${params[1]}`) ? { op_id: params[1] } : null;
  }
  return state.rows.get(params[0]) || null;
}

function readRows(sql, params, state) {
  return state.events.filter((event) => event.session_id === params[0]).sort((left, right) => left.revision - right.revision);
}

async function main() {
  const db = fakeDb();
  const session = await syncytium.createSession('Persistent shared state.', { db });
  const operation = { opId: 'op-once', agentId: 'worker-1', role: 'parallel_executor', kind: { type: 'insert_text', index: 0, text: 'safe' } };
  await syncytium.applyOperation(session.sessionId, operation, { db });
  await syncytium.applyOperation(session.sessionId, operation, { db });
  const record = await persistence.loadSession(db, session.sessionId);
  assert.equal(record.revision, 1);
  assert.equal(record.state.ops.length, 1);
  assert.equal(syncytium.rehydrate(record).crdt.getSnapshot().textContent, 'safe');
  assert.deepEqual((await persistence.loadEvents(db, session.sessionId)).map((event) => event.type), ['SESSION_CREATED', 'OPERATION_APPLIED']);
  const transactionSession = await syncytium.createSession('Persistent atomic operations.', {
    db,
    schema: { fields: [{ path: 'owner', dataType: 'LWW_REGISTER' }, { path: 'status', dataType: 'LWW_REGISTER' }] }
  });
  await syncytium.applyTransaction(transactionSession.sessionId, {
    txId: 'persisted-tx',
    operations: [
      { opId: 'persisted-owner', actorId: 'operator', kind: { type: 'set_field', key: 'owner', value: 'B' } },
      { opId: 'persisted-status', actorId: 'operator', kind: { type: 'set_field', key: 'status', value: 'ready' } }
    ]
  }, { db });
  const transactionRecord = await persistence.loadSession(db, transactionSession.sessionId);
  const transactionEvents = await persistence.loadEvents(db, transactionSession.sessionId);
  assert.equal(transactionRecord.revision, 1);
  assert.equal(transactionRecord.state.ops.length, 2);
  assert.equal(transactionRecord.state.ops.every((item) => item.transactionId === 'persisted-tx'), true);
  assert.equal(transactionEvents.at(-1).type, 'TRANSACTION_COMMITTED');
  assert.equal(transactionEvents.at(-1).payload.operations.length, 2);
  await assert.rejects(
    () => persistence.commitSession(db, { sessionId: session.sessionId, revision: 0, state: {} }, { opId: 'stale-op' }),
    (error) => error.code === 'SYNCYTIUM_SESSION_CONFLICT'
  );
  const afterConflict = await persistence.loadSession(db, session.sessionId);
  assert.equal(afterConflict.state.ops.length, 1);
  const failingDb = {
    run: async (sql) => {
      if (String(sql).trim().toUpperCase().startsWith('INSERT INTO TOPOLOGY_SESSIONS')) throw new Error('disk unavailable');
      return { changes: 0 };
    },
    get: async () => null,
    all: async () => []
  };
  await assert.rejects(
    () => syncytium.createSession('Must persist.', { db: failingDb }),
    (error) => error.code === 'SYNCYTIUM_PERSISTENCE_FAILURE'
  );
}

main().then(() => console.log('Syncytium persistence safety checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
