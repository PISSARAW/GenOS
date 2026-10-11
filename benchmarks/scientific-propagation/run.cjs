'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const { open } = require('../../backend/node_modules/sqlite');
const propagation = require('../../backend/src/services/scientificPropagation');
const transport = require('../../backend/src/services/scientificPropagation/transport');
const references = require('../../backend/src/services/scientificReferences');

function integer(value, minimum) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= minimum && number <= 1000);
  return number;
}

function options(argv) {
  const values = Object.fromEntries(argv.map((argument) => argument.split('=', 2)));
  return { recipients: integer(values['--recipients'] || '10', 1),
    batch: integer(values['--batch'] || '100', 1) };
}

function sourceRef() {
  return { organizationId: 'org', projectId: 'project', workspaceId: 'space',
    objectType: 'result', objectId: 'synthetic-source', version: 1 };
}

function consumerRef(index) {
  return { ...sourceRef(), objectId: `synthetic-derived-${index}` };
}

function recipientId(index) { return `scientist-${String(index).padStart(4, '0')}`; }

async function database(recipients) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await propagation.ensureTables(db);
  await references.ensureTables(db);
  await db.exec(`CREATE TABLE signal_blobs (
      signal_id TEXT PRIMARY KEY, signal_type TEXT, signal_blob BLOB, sender_agent_id TEXT,
      content TEXT, topic TEXT, expires_at TEXT);
    CREATE TABLE signal_deliveries (
      signal_id TEXT NOT NULL, subscriber_agent_id TEXT NOT NULL, status TEXT NOT NULL,
      delivered_at TEXT, PRIMARY KEY (signal_id, subscriber_agent_id));
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('space', 'org', 'project');
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, workspace_id TEXT,
      status TEXT, execution_mode TEXT, parent_agent_id TEXT);
    INSERT INTO agents VALUES ('author', 'Author', 'space', 'running', 'orchestrator', NULL);
    CREATE TABLE signal_channel_weights (channel TEXT PRIMARY KEY, weight REAL,
      last_updated INTEGER, hits INTEGER, misses INTEGER, last_signal_type TEXT);`);
  await db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < recipients; index++) {
      await db.run(`INSERT INTO agents VALUES (?, ?, 'space', 'running', 'worker', 'author')`,
        recipientId(index), `Recipient ${index}`);
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return db;
}

async function timed(operation) {
  const start = performance.now();
  const value = await operation();
  return { value, ms: performance.now() - start };
}

function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
  return { p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99) };
}

async function register(db, recipients) {
  const measurement = await timed(async () => {
    for (let index = 0; index < recipients; index++) {
      await propagation.registerDependencies(db, { consumerRef: consumerRef(index),
        dependencies: [sourceRef()], consumerAgentId: recipientId(index) });
    }
  });
  const agents = await propagation.consumersFor(db, { ref: sourceRef() });
  assert.equal(agents.length, recipients);
  return { agents, ms: measurement.ms };
}

async function dispatchAll(db, expected, batch) {
  const start = performance.now();
  const latencies = [];
  let acknowledged = 0;
  while (acknowledged < expected) {
    const outcomes = await propagation.dispatchOutbox(db, {
      workerId: 'scientific-benchmark-dispatcher', limit: batch,
      publishSignal: async (params) => {
        const result = await transport.publishScientificSignal(db, params);
        latencies.push(performance.now() - start);
        return result;
      } });
    assert(outcomes.length > 0, 'delivery stopped before all events were acknowledged');
    assert(outcomes.every((outcome) => outcome.acked), JSON.stringify(outcomes.filter((row) => !row.acked)));
    acknowledged += outcomes.length;
  }
  assert.equal(acknowledged, expected);
  assert.equal(latencies.length, expected);
  const totalMs = performance.now() - start;
  return { events: acknowledged, totalMs, eventsPerSecond: acknowledged * 1000 / totalMs,
    ...percentiles(latencies) };
}

async function count(db, query) {
  return (await db.get(query)).count;
}

async function publishPhase(db, agents) {
  const input = { eventType: 'publish', ref: sourceRef(), recipients: agents,
    payload: { senderAgentId: 'author', kind: 'synthetic_transport_probe' } };
  const publication = await timed(() => propagation.enqueueEvent(db, input));
  assert.equal(publication.value.length, agents.length);
  const duplicate = await timed(() => propagation.enqueueEvent(db, input));
  assert.deepEqual(duplicate.value, publication.value);
  assert.equal(await count(db, 'SELECT COUNT(*) AS count FROM scientific_outbox'), agents.length);
  const [blocked] = await propagation.dispatchOutbox(db, {
    workerId: 'scientific-benchmark-gate', limit: 1 });
  assert.equal(blocked.acked, false);
  assert.match(blocked.reason, /reference is unavailable/);
  assert.equal(await count(db, 'SELECT COUNT(*) AS count FROM signal_blobs'), 0);
  await db.run("DELETE FROM scientific_outbox WHERE event_type = 'publish'");
  return { enqueueMs: publication.ms, duplicateMs: duplicate.ms, targeted: agents.length,
    delivered: 0, gate: 'verified_reference_required' };
}

async function retractPhase(db, agents, batch) {
  const digest = `sha256:${'a'.repeat(64)}`;
  const input = { ref: sourceRef(), retractionReceiptId: 'synthetic-retraction',
    retractionReceiptDigest: digest, reason: 'transport benchmark only', senderAgentId: 'author' };
  const cascade = await timed(() => propagation.invalidateDependents(db, input));
  assert.equal(cascade.value.affectedCount, agents.length);
  assert.equal(cascade.value.eventIds.length, agents.length);
  const retraction = { eventType: 'retract', ref: sourceRef(), recipients: agents,
    idempotencyKey: input.retractionReceiptId,
    payload: { ...input, senderAgentId: 'author' } };
  const announcement = await timed(() => propagation.enqueueEvent(db, retraction));
  const duplicate = await timed(() => propagation.enqueueEvent(db, retraction));
  assert.deepEqual(duplicate.value, announcement.value);
  assert.equal(await count(db, "SELECT COUNT(*) AS count FROM scientific_outbox WHERE state = 'pending'"),
    agents.length * 2);
  const delivery = await dispatchAll(db, agents.length * 2, batch);
  return { cascadeMs: cascade.ms, announcementMs: announcement.ms,
    duplicateMs: duplicate.ms, invalidations: cascade.value.eventIds.length,
    retractions: announcement.value.length, delivery };
}

function revision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim(); }
  catch { return null; }
}

async function main() {
  const config = options(process.argv.slice(2));
  const db = await database(config.recipients);
  try {
    const registration = await register(db, config.recipients);
    const publish = await publishPhase(db, registration.agents);
    const retract = await retractPhase(db, registration.agents, config.batch);
    const signals = await count(db, 'SELECT COUNT(*) AS count FROM signal_blobs');
    const deliveries = await count(db, "SELECT COUNT(*) AS count FROM signal_deliveries WHERE status = 'pending'");
    assert.equal(signals, config.recipients * 2);
    assert.equal(deliveries, config.recipients * 2);
    process.stdout.write(`${JSON.stringify({ protocol: 'scientific-propagation-v1', revision: revision(),
      environment: { platform: process.platform, arch: process.arch, node: process.version,
        cpu: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length,
        database: 'SQLite memory', transport: 'native targeted signal' }, config,
      reference: references.formatReference(sourceRef()), registrationMs: registration.ms,
      publish, retract, durableSignals: signals, pendingRecipientDeliveries: deliveries }, null, 2)}\n`);
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
