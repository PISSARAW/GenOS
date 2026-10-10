'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const os = require('node:os');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const { open } = require('../../backend/node_modules/sqlite');
const { MathematicalDependencyGraph, LeanIncrementalGate } =
  require('../../backend/src/services/epistemicScheduler');
const references = require('../../backend/src/services/scientificReferences');
const propagation = require('../../backend/src/services/scientificPropagation');
const { createScientificWorkflow } =
  require('../../backend/src/services/scientificWorkflowService');
const { createScientificReceiptAuthority } =
  require('../../backend/src/services/scientificReceiptAuthority');
const { globalRegistry } =
  require('../../backend/src/services/mathematical/verificationRegistry');

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const source = 'theorem source : 0 = 0 := by rfl';
const ref = { organizationId: 'org', projectId: 'project', workspaceId: 'space',
  objectType: 'theorem', objectId: 'source', version: 1 };

function parseInteger(value, maximum) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 1 && number <= maximum);
  return number;
}

function config() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.split('=', 2)));
  const agents = parseInteger(args['--agents'] || '100', 10000);
  const subscribers = parseInteger(args['--subscribers'] || '3', agents);
  const batch = parseInteger(args['--batch'] || '100', 100);
  return { agents, subscribers, batch };
}

function agentId(index) { return `scientist-${String(index).padStart(5, '0')}`; }

async function timed(operation) {
  const start = performance.now();
  const value = await operation();
  return { value, ms: performance.now() - start };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] || 0;
}

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await references.ensureTables(db);
  await propagation.ensureTables(db);
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('space', 'org', 'project');
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, workspace_id TEXT,
      status TEXT, execution_mode TEXT, parent_agent_id TEXT);
    INSERT INTO agents VALUES ('author', 'Author', 'space', 'running', 'orchestrator', NULL);
    CREATE TABLE signal_blobs (signal_id TEXT PRIMARY KEY, signal_type TEXT,
      signal_blob BLOB, sender_agent_id TEXT, content TEXT, topic TEXT, expires_at TEXT);
    CREATE TABLE signal_deliveries (signal_id TEXT NOT NULL, subscriber_agent_id TEXT NOT NULL,
      status TEXT NOT NULL, delivered_at TEXT, PRIMARY KEY (signal_id, subscriber_agent_id));
    CREATE TABLE signal_channel_weights (channel TEXT PRIMARY KEY, weight REAL,
      last_updated INTEGER, hits INTEGER, misses INTEGER, last_signal_type TEXT);`);
  return db;
}

async function populate(db, agents) {
  await db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < agents; index++) {
      await db.run(`INSERT INTO agents VALUES (?, ?, 'space', 'running', 'worker', 'author')`,
        agentId(index), `Recipient ${index}`);
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function fixture(db) {
  const toolchainVersion = 'synthetic-benchmark-executor';
  const environmentDigest = digest('benchmark-environment');
  const executor = async () => ({ exitCode: 0, toolchainVersion, axioms: [] });
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: ref.objectId, type: 'theorem',
    canonicalStatement: '0 = 0', status: 'formalized' });
  const gate = new LeanIncrementalGate({ graph, environmentDigest,
    toolchainVersion, executor });
  const receipt = await gate.verifyNode({ nodeId: ref.objectId, source });
  assert.equal(receipt.status, 'passed');
  const authority = createScientificReceiptAuthority({ db, executor,
    toolchainVersion, environmentDigest });
  await authority.attest({ receipt, ref, source, canonicalStatement: '0 = 0' });
  const retractionDigest = digest('benchmark-retraction');
  const store = references.createScientificReferenceStore({
    verifyReceipt: authority.verifyReceipt,
    verifyRetractionReceipt: async (value) => value === retractionDigest ? {
      status: 'validated', id: 'benchmark-retraction', receiptDigest: value, ref,
    } : null,
  });
  return { workflow: createScientificWorkflow({ db, referenceStore: store }),
    receipt, retractionDigest };
}

async function subscribe(db, workflow, subscribers) {
  await workflow.subscribeReference({ ref, consumerAgentId: agentId(0) });
  for (let index = 1; index < subscribers; index++) {
    await propagation.subscribeReference(db, { ref, consumerAgentId: agentId(index) });
  }
  const recipients = await propagation.consumersFor(db, { ref });
  assert.equal(recipients.length, subscribers);
}

async function dispatchAll(db, expected, batch) {
  const started = performance.now();
  const latencies = [];
  let acknowledged = 0;
  while (acknowledged < expected) {
    const outcomes = await propagation.dispatchOutbox(db, {
      workerId: 'scientific-scale-dispatcher', limit: batch,
      publishSignal: async (params) => {
        const result = await require('../../backend/src/services/scientificPropagation/transport')
          .publishScientificSignal(db, params);
        latencies.push(performance.now() - started);
        return result;
      },
    });
    assert(outcomes.length > 0, 'outbox stopped before expected deliveries');
    assert(outcomes.every((item) => item.acked), JSON.stringify(outcomes.filter((item) => !item.acked)));
    acknowledged += outcomes.length;
  }
  assert.equal(acknowledged, expected);
  return { events: acknowledged, ms: performance.now() - started,
    p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99) };
}

async function count(db, table) {
  return (await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count;
}

async function main() {
  const input = config();
  const db = await database();
  try {
    const setup = await timed(() => populate(db, input.agents));
    const { workflow, receipt, retractionDigest } = await fixture(db);
    const subscriptions = await timed(() => subscribe(db, workflow, input.subscribers));
    const publish = await timed(() => workflow.publishVerified({
      reference: { ...ref, contentDigest: digest(Buffer.from(source)),
        sourceDigest: receipt.sourceDigest, canonicalStatement: '0 = 0',
        formalStatementDigest: receipt.formalStatementDigest,
        environmentDigest: receipt.environmentDigest, assumptions: [],
        validityDomain: 'equality', dependencies: [] },
      contentBytes: Buffer.from(source), receiptDigest: receipt.receiptDigest,
      senderAgentId: 'author',
    }));
    assert.equal(publish.value.recipients.length, input.subscribers);
    const published = await dispatchAll(db, input.subscribers, input.batch);
    const retract = await timed(() => workflow.retract({ ref,
      retractionReceiptId: 'benchmark-retraction', retractionReceiptDigest: retractionDigest,
      reason: 'synthetic benchmark retraction', senderAgentId: 'author' }));
    const retracted = await dispatchAll(db, input.subscribers, input.batch);
    assert.equal(await count(db, 'signal_blobs'), input.subscribers * 2);
    assert.equal(await count(db, 'signal_deliveries'), input.subscribers * 2);
    const pages = await db.get('PRAGMA page_count');
    const pageSize = await db.get('PRAGMA page_size');
    process.stdout.write(`${JSON.stringify({ protocol: 'scientific-flow-scale-v1',
      proof: 'synthetic executor; no Lean claim', environment: {
        platform: process.platform, node: process.version, cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length, database: 'SQLite memory' },
      input, setupMs: setup.ms, subscriptionMs: subscriptions.ms,
      publishMs: publish.ms, published, retractMs: retract.ms, retracted,
      durableSignals: await count(db, 'signal_blobs'),
      databaseBytes: pages.page_count * pageSize.page_size,
      rssBytes: process.memoryUsage().rss }, null, 2)}\n`);
  } finally { globalRegistry.clear(); await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
