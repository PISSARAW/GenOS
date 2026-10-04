'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrateRelationalExecution } = require('../../src/db/migrations/migrateRelationalExecution');
const { publishGuardedReferences } = require('../../src/services/relationalPhysiology/executionBoundary');
const { executeRelationalTransport } = require('../../src/services/relationalPhysiology/httpTransport');
const { decodeSignalRow } = require('../../src/services/signalEnvelopeCodec');

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    exec: async (sql) => sqlite.exec(sql),
    get: async (sql, args = []) => sqlite.prepare(sql).get(...args),
    all: async (sql, args = []) => sqlite.prepare(sql).all(...args),
    run: async (sql, args = []) => sqlite.prepare(sql).run(...args)
  };
  sqlite.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, role TEXT, status TEXT);
    CREATE TABLE agent_relations (id TEXT PRIMARY KEY, source_agent_id TEXT,
      target_agent_id TEXT, relation_type TEXT, metadata_json TEXT,
      organization_id TEXT, project_id TEXT);
    CREATE TABLE signal_blobs (signal_id TEXT UNIQUE, signal_type TEXT,
      signal_blob BLOB, content TEXT, topic TEXT, sender_agent_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, expires_at TEXT);
    CREATE TABLE signal_subscriptions (subscriber_agent_id TEXT, topic TEXT,
      PRIMARY KEY (subscriber_agent_id, topic));
    CREATE TABLE signal_deliveries (signal_id TEXT, subscriber_agent_id TEXT,
      status TEXT, PRIMARY KEY (signal_id, subscriber_agent_id));`);
  await migrateRelationalExecution(db);
  await db.run("INSERT INTO agents VALUES ('A', 'worker', 'running'), ('B', 'verifier_worker', 'idle')");
  await db.run(`INSERT INTO agent_relations VALUES
    ('edge', 'A', 'B', 'verifier', '{}', 'org', 'project')`);
  await db.run(`INSERT INTO rpe_communication_grants VALUES
    ('org', 'project', 'A', 'B', ?, ?, 'semantic_ack')`,
  [JSON.stringify([
    { id: 'problem', hash: 'p1', kind: 'problem' },
    { id: 'evidence', hash: 'e1', kind: 'evidence' },
    { id: 'plan', hash: 'x1', kind: 'plan' }
  ]), Date.now() + 60_000]);
  return { db, sqlite };
}

function input(db, operationId = 'op-1') {
  return {
    db, actorId: 'A', scope: { organizationId: 'org', projectId: 'project' },
    communication: {
      operationId, receiverId: 'B', refs: [
        { id: 'problem', hash: 'p1', kind: 'problem' },
        { id: 'evidence', hash: 'e1', kind: 'evidence' },
        { id: 'plan', hash: 'x1', kind: 'plan' }
      ]
    }
  };
}

test('real SQLite admission stores only the blind allowlist and a targeted delivery', async () => {
  const { db, sqlite } = await fixture();
  try {
    const result = await publishGuardedReferences(input(db));
    assert.equal(result.status, 'executed');
    assert.deepEqual(result.decision.plan.refs.map((ref) => ref.id), ['evidence', 'problem']);
    const row = await db.get('SELECT * FROM signal_blobs');
    const decoded = decodeSignalRow(row);
    assert.equal(decoded.integrity.status, 'verified');
    assert.deepEqual(decoded.decoded.refs.map((ref) => ref.id), ['evidence', 'problem']);
    assert.equal(JSON.stringify(decoded.decoded).includes('x1'), false);
    assert.deepEqual(decoded.decoded.communicationEnvelope.recipientAgentIds, ['B']);
    assert.equal((await db.get('SELECT status FROM signal_deliveries')).status, 'pending');
  } finally { sqlite.close(); }
});

test('revoked grant blocks admission, retains denial and leaves transport empty', async () => {
  const { db, sqlite } = await fixture();
  try {
    await db.run('DELETE FROM rpe_communication_grants');
    const result = await publishGuardedReferences(input(db));
    assert.equal(result.status, 'denied');
    assert.ok(result.decision.reasonCodes.includes('BASE_AUTHORIZATION_DENIED'));
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 0);
    assert.equal((await db.get('SELECT status FROM rpe_execution_decisions')).status, 'denied');
  } finally { sqlite.close(); }
});

test('grant binds exact reference hash and scope before transport', async () => {
  const { db, sqlite } = await fixture();
  try {
    const changed = input(db);
    changed.communication.refs = [{ id: 'evidence', hash: 'e2', kind: 'evidence' }];
    const result = await publishGuardedReferences(changed);
    assert.equal(result.status, 'silent');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 0);
    const otherScope = input(db, 'op-other');
    otherScope.scope.projectId = 'other';
    const denied = await publishGuardedReferences(otherScope);
    assert.equal(denied.status, 'denied');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 0);
  } finally { sqlite.close(); }
});

test('stale graph revision is denied after grant changes', async () => {
  const { db, sqlite } = await fixture();
  try {
    const first = await publishGuardedReferences(input(db));
    await db.run(`UPDATE rpe_communication_grants SET required_ack = 'verified_ack'`);
    const later = input(db, 'op-later');
    later.communication.expectedRevision = first.decision.revision;
    const result = await publishGuardedReferences(later);
    assert.equal(result.status, 'denied');
    assert.ok(result.decision.reasonCodes.includes('RELATION_REVISION_CHANGED'));
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 1);
  } finally { sqlite.close(); }
});

test('operation id is durable and cannot be reused for changed content', async () => {
  const { db, sqlite } = await fixture();
  try {
    const original = await publishGuardedReferences(input(db));
    assert.deepEqual(await publishGuardedReferences(input(db)), original);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 1);
    const changed = input(db);
    changed.communication.refs = [];
    await assert.rejects(publishGuardedReferences(changed), /RPE_OPERATION_ID_CONFLICT/);
  } finally { sqlite.close(); }
});

test('transport failure rolls back decision and delivery together', async () => {
  const { db, sqlite } = await fixture();
  try {
    await db.exec('DROP TABLE signal_blobs');
    await assert.rejects(publishGuardedReferences(input(db)), /signal_blobs/);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM rpe_execution_decisions')).n, 0);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_deliveries')).n, 0);
  } finally { sqlite.close(); }
});

test('concurrent duplicate admissions create exactly one signal', async () => {
  const { db, sqlite } = await fixture();
  try {
    const results = await Promise.all([
      publishGuardedReferences(input(db)), publishGuardedReferences(input(db))
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 1);
  } finally { sqlite.close(); }
});

test('HTTP transport admits a typed request and rejects free payload data', async () => {
  const { db, sqlite } = await fixture();
  const response = () => ({
    code: null, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  });
  try {
    const args = { signal_type: 'ligand', signal_data: {},
      relational: input(db).communication };
    const accepted = await executeRelationalTransport({
      res: response(), db, args, agentId: 'A',
      scope: { organizationId: 'org', projectId: 'project' }
    });
    assert.equal(accepted.code, 200);
    assert.equal(accepted.body.published, true);
    const rejected = await executeRelationalTransport({
      res: response(), db, args: { ...args, signal_data: { hidden: 'body' } },
      agentId: 'A', scope: { organizationId: 'org', projectId: 'project' }
    });
    assert.equal(rejected.code, 400);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM signal_blobs')).n, 1);
  } finally { sqlite.close(); }
});
