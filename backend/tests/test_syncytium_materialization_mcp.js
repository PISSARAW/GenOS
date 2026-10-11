'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const syncytium = require('../src/services/syncytiumCoordinationService');
const completion = require('../src/services/syncytiumMissionCompletionService');
const topology = require('../src/services/topologySessionTools');

function missionOptions(db) {
  return { db, schema: { fields: { result: { dataType: 'LWW_REGISTER' } }, invariants: [
    { id: 'result-present', predicate: { op: 'present', path: 'result' } }
  ] } };
}

async function bindWorker(db, sessionId) {
  await db.run('INSERT INTO agents (id, execution_mode, metadata_json) VALUES (?, ?, ?)',
    'worker', 'worker', JSON.stringify({ topologySessionId: sessionId }));
}

async function applyResult(db, sessionId, result) {
  return topology.applyTopologyOperation(db, { session_id: sessionId, operation: 'apply',
    op: { opId: result.opId, kind: { type: 'set_field', key: 'result', value: result.value } } }, { agentId: 'worker' });
}

function workerOutput() {
  return { members: [{ status: 'completed' }], dispatchFailures: [] };
}

async function verifyOrchestratorScope(db, sessionId) {
  const other = await syncytium.createSession('Unrelated session.', missionOptions(db));
  await db.run('INSERT INTO agents (id, workspace_id, execution_mode) VALUES (?, ?, ?)',
    'parent', 'ws-1', 'orchestrator');
  await db.run(`INSERT INTO agents (id, workspace_id, parent_agent_id, execution_mode, metadata_json)
    VALUES (?, ?, ?, ?, ?)`, 'other-worker', 'ws-1', 'parent', 'worker',
  JSON.stringify({ topologySessionId: other.sessionId }));
  const call = () => topology.applyTopologyOperation(db, {
    session_id: sessionId, operation: 'materialize'
  }, { agentId: 'parent' });
  await assert.rejects(call(), (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  await db.run(`INSERT INTO agents (id, workspace_id, parent_agent_id, execution_mode, metadata_json)
    VALUES (?, ?, ?, ?, ?)`, 'foreign-workspace', 'ws-2', 'parent', 'worker',
  JSON.stringify({ topologySessionId: sessionId }));
  await assert.rejects(call(), (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
  await db.run(`INSERT INTO agents (id, workspace_id, parent_agent_id, execution_mode, metadata_json)
    VALUES (?, ?, ?, ?, ?)`, 'linked-worker', 'ws-1', 'parent', 'worker',
  JSON.stringify({ topologySessionId: sessionId }));
  assert.equal((await call()).materialization.status, 'verified');
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT,
      parent_agent_id TEXT, execution_mode TEXT, metadata_json TEXT)`);
    const session = await syncytium.createSession('Commit one verified shared result.', missionOptions(db));
    await bindWorker(db, session.sessionId);
    await assert.rejects(topology.applyTopologyOperation(db, {
      session_id: session.sessionId, operation: 'materialize'
    }), (error) => error.code === 'TOPOLOGY_CALLER_DENIED');
    await applyResult(db, session.sessionId, { opId: 'result-1', value: 'first' });
    assert.equal((await completion.validateSession(session.sessionId, { db })).status, 'incomplete');
    const receipt = await topology.applyTopologyOperation(db, {
      session_id: session.sessionId, operation: 'materialize'
    }, { agentId: 'worker' });
    assert.equal(receipt.materialization.status, 'verified');
    assert.equal(receipt.materialization.stateVersion, 1);
    assert.equal((await completion.validateSession(session.sessionId, { db })).snapshotId,
      receipt.materialization.snapshotId);
    await applyResult(db, session.sessionId, { opId: 'result-2', value: 'second' });
    assert.ok((await completion.validateSession(session.sessionId, { db })).reasons
      .includes('MATERIALIZATION_MISSING_OR_STALE'));
    await syncytium.joinReplica(session.sessionId, { replicaId: 'remote', actorId: 'remote' }, { db });
    await syncytium.partitionReplica(session.sessionId, 'remote', { db });
    await assert.rejects(topology.applyTopologyOperation(db, {
      session_id: session.sessionId, operation: 'materialize'
    }, { agentId: 'worker' }), (error) => error.reason === 'REPLICA_NOT_RECONCILED');
    await syncytium.leaveReplica(session.sessionId, 'remote', { db });
    const finalReceipt = await topology.applyTopologyOperation(db, {
      session_id: session.sessionId, operation: 'materialize'
    }, { agentId: 'worker' });
    assert.equal(finalReceipt.materialization.stateVersion, 2);
    await verifyOrchestratorScope(db, session.sessionId);

    const closure = await syncytium.createSession('Close a coherent worker mission.', missionOptions(db));
    await syncytium.applyOperation(closure.sessionId, { opId: 'closure', actorId: 'worker',
      kind: { type: 'set_field', key: 'result', value: 'done' } }, { db });
    const output = await completion.validateAndComplete({ db, sessionId: closure.sessionId,
      output: workerOutput(), validation: { status: 'complete', workerCount: 1, coveredWorkers: 1 },
      expectedCount: 1 });
    assert.equal(output.complete, true);
    assert.equal(output.materialization.status, 'verified');
    assert.equal(output.stateValidation.snapshotId, output.materialization.snapshotId);
    const empty = await syncytium.createSession('No invented shared proof.', missionOptions(db));
    const incomplete = await completion.validateAndComplete({ db, sessionId: empty.sessionId,
      output: workerOutput(), validation: { status: 'complete', workerCount: 1, coveredWorkers: 1 },
      expectedCount: 1 });
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.materialization.reason, 'EMPTY_SHARED_STATE');
    assert.equal((await syncytium.listSnapshots(empty.sessionId, { db })).length, 0);
    console.log('Syncytium MCP materialization and mission closure: PASS');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
