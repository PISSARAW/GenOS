'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../src/services/epistemicScheduler');
const { createScientificReferenceStore, formatReference } = require('../src/services/scientificReferences');
const { createScientificWorkflow } = require('../src/services/scientificWorkflowService');
const visibility = require('../src/services/cognitiveScientificReferenceVisibility');
const { globalRegistry } = require('../src/services/mathematical/verificationRegistry');

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('w1', 'org', 'project');
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT INTO agents VALUES ('agent-author', 'w1');
    INSERT INTO agents VALUES ('agent-consumer', 'w1');`);
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: 'source', type: 'theorem', canonicalStatement: '0 = 0', status: 'formalized' });
  graph.addNode({ nodeId: 'derived', type: 'theorem', canonicalStatement: '1 = 1', status: 'formalized' });
  graph.addEdge({ from: 'source', to: 'derived', type: 'uses' });
  const gate = new LeanIncrementalGate({ graph, environmentDigest: hash('environment'),
    toolchainVersion: 'lean-test', executor: async () => ({ exitCode: 0,
      toolchainVersion: 'lean-test', axioms: [] }) });
  const receipts = new Map();
  const retractions = new Map();
  const store = createScientificReferenceStore({
    verifyReceipt: async (digest, ref) => receipts.get(`${digest}|${formatReference(ref)}`),
    verifyRetractionReceipt: async (digest) => retractions.get(digest),
  });
  const workflow = createScientificWorkflow({ db, referenceStore: store });
  return { db, gate, receipts, retractions, store, workflow };
}

async function inputFor(f, input) {
  const { objectId, statement, source, dependencies = [] } = input;
  const receipt = await f.gate.verifyNode({ nodeId: objectId, source });
  assert.equal(receipt.status, 'passed');
  const ref = { organizationId: 'org', projectId: 'project', workspaceId: 'w1',
    objectType: 'theorem', objectId, version: 1 };
  f.receipts.set(`${receipt.receiptDigest}|${formatReference(ref)}`, { receipt, ref });
  const contentBytes = Buffer.from(source, 'utf8');
  const reference = { ...ref, contentDigest: hash(contentBytes), sourceDigest: receipt.sourceDigest,
    canonicalStatement: statement, formalStatementDigest: receipt.formalStatementDigest,
    environmentDigest: receipt.environmentDigest, assumptions: [], validityDomain: 'equality',
    dependencies };
  return { reference, contentBytes, receiptDigest: receipt.receiptDigest,
    senderAgentId: 'agent-author' };
}

async function run() {
  const f = await fixture();
  try {
    const source = await inputFor(f, { objectId: 'source', statement: '0 = 0',
      source: 'theorem source : 0 = 0 := by rfl' });
    await assert.rejects(() => f.workflow.publishVerified({ ...source,
      senderAgentId: 'foreign' }), (error) => error.code === 'SCI_REF_PARTICIPANT_SCOPE');
    const sourceResult = await f.workflow.publishVerified(source);
    assert.equal(sourceResult.status, 'verified');
    const derived = await inputFor(f, { objectId: 'derived', statement: '1 = 1',
      source: 'theorem derived : 1 = 1 := by rfl',
      dependencies: [{ ...source.reference, receiptDigest: source.receiptDigest }] });
    await assert.rejects(() => f.workflow.publishVerified({ ...derived,
      consumerAgentId: 'foreign' }), (error) => error.code === 'SCI_REF_PARTICIPANT_SCOPE');
    await f.workflow.publishVerified({ ...derived, consumerAgentId: 'agent-consumer' });
    const before = await f.db.get(`SELECT state FROM scientific_obligations LIMIT 1`);
    assert.equal(before.state, 'open');
    const scope = { organizationId: 'org', projectId: 'project', workspaceId: 'w1' };
    for (const sessionId of ['session-1', 'session-2']) {
      const state = { context: { db: f.db, sessionId, ...scope,
        scientificReferenceStore: f.store }, values: {} };
      const read = await visibility.read({ id: 'source-read', reference: sourceResult.uri }, state);
      assert.equal(read.status, 'ready');
    }
    const retractionReceiptDigest = hash('retraction receipt');
    const retraction = { ref: source.reference, retractionReceiptId: 'ret-1',
      retractionReceiptDigest, reason: 'independent counterexample', senderAgentId: 'agent-author' };
    f.retractions.set(retractionReceiptDigest, { status: 'validated', id: 'ret-1',
      receiptDigest: retractionReceiptDigest, ref: source.reference });
    await assert.rejects(() => f.workflow.retract({ ...retraction, reason: '' }),
      /Retraction reason required/);
    const rolledBack = await f.db.get(`SELECT status FROM scientific_references
      WHERE object_id = 'source'`);
    assert.equal(rolledBack.status, 'verified');
    const result = await f.workflow.retract(retraction);
    assert.equal(result.affectedCount, 1);
    const rows = await f.db.all(`SELECT object_id, status FROM scientific_references ORDER BY object_id`);
    assert.deepEqual(rows.map((row) => [row.object_id, row.status]),
      [['derived', 'stale'], ['source', 'stale']]);
    const obligation = await f.db.get(`SELECT state FROM scientific_obligations LIMIT 1`);
    assert.equal(obligation.state, 'stale');
    const visible = await f.db.all(`SELECT session_id, valid FROM cognitive_visibility_fragments
      WHERE object_id = ? ORDER BY session_id`, sourceResult.uri);
    assert.deepEqual(visible.map((row) => [row.session_id, row.valid]),
      [['session-1', 0], ['session-2', 0]]);
    const events = await f.db.all(`SELECT event_type, recipient_agent_id, payload_json
      FROM scientific_outbox ORDER BY priority DESC`);
    assert.deepEqual(events.map((row) => row.event_type), ['retract', 'invalidate']);
    assert.ok(events.every((row) => row.recipient_agent_id === 'agent-consumer'));
    assert.ok(events.every((row) => JSON.parse(row.payload_json).senderAgentId === 'agent-author'));
    await assert.rejects(() => f.store.resolveReference(f.db, {
      ref: sourceResult.uri, requesterScope: { organizationId: 'org',
        projectId: 'project', workspaceId: 'w1' } }),
    (error) => error.code === 'SCI_REF_STALE');
    console.log('Scientific workflow: atomic rollback, cascading staleness and outbox passed.');
  } finally {
    globalRegistry.clear();
    await f.db.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
