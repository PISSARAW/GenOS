'use strict';

const assert = require('assert');
const fixture = require('./ontogenesisFixture');
const { defaultConfig, migrateProjectConfig, validateProjectConfig } = require('../src/services/ontogenesis/configSchema');
const operations = require('../src/services/ontogenesis/operationJournal');
const artifacts = require('../src/services/ontogenesis/artifactRegistry');
const outbox = require('../src/services/ontogenesis/outboxStore');

function legacyConfig() {
  const config = defaultConfig();
  config.version = 1;
  delete config.durability;
  delete config.retention;
  delete config.publication;
  delete config.merge;
  return config;
}

async function testMigration() {
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: require('sqlite3').Database });
  await db.exec('PRAGMA foreign_keys = ON');
  await require('../src/db/migrations/migrateOntogenesis').migrateOntogenesis(db);
  await db.run(`INSERT INTO ontogenesis_projects
    (id, root_path, branch, config_json, config_version) VALUES ('legacy', '.', 'codex/custom', ?, 1)`,
  [JSON.stringify({ ...legacyConfig(), branch: 'codex/custom', authority: undefined })]);
  const migrate = require('../src/db/migrations/migrateOntogenesisDurableFoundation')
    .migrateOntogenesisDurableFoundation;
  await migrate(db);
  await migrate(db);
  const row = await db.get("SELECT * FROM ontogenesis_projects WHERE id = 'legacy'");
  const config = JSON.parse(row.config_json);
  assert.strictEqual(row.config_version, 2);
  assert.strictEqual(config.version, 2);
  assert.strictEqual(config.authority, undefined);
  assert.deepStrictEqual(config.durability, { recoveryPolicy: 'reconcile', ambiguousOutcome: 'escalate' });
  assert.strictEqual(config.publication.enabled, false);
  assert.strictEqual(config.merge.enabled, false);
  await db.close();
}

async function testStores() {
  const db = await fixture.memoryDb();
  await db.run(`INSERT INTO ontogenesis_projects
    (id, root_path, branch, config_json, config_version) VALUES ('foundation', '.', 'codex/test', ?, 2)`,
  [JSON.stringify(defaultConfig())]);
  const operation = await operations.prepareOperation(db, { projectId: 'foundation', kind: 'dispatch',
    idempotencyKey: 'dispatch:1', intent: { task: 'one', values: { b: 2, a: 1 } } });
  const replay = await operations.prepareOperation(db, { projectId: 'foundation', kind: 'dispatch',
    idempotencyKey: 'dispatch:1', intent: { values: { a: 1, b: 2 }, task: 'one' } });
  assert.strictEqual(replay.id, operation.id);
  await assert.rejects(operations.prepareOperation(db, { projectId: 'foundation', kind: 'dispatch',
    idempotencyKey: 'dispatch:1', intent: { task: 'two' } }), /idempotence-conflit/);
  assert.strictEqual((await operations.transitionOperation(db, {
    operationId: operation.id, state: 'started' })).state, 'started');
  await assert.rejects(operations.transitionOperation(db, {
    operationId: operation.id, state: 'completed' }), /transition-operation-invalide/);

  const artifact = await artifacts.registerArtifact(db, { projectId: 'foundation', operationId: operation.id,
    kind: 'capsule', path: '.genos/capsules/one', contentHash: 'abc', legalHold: true });
  await assert.rejects(artifacts.transitionArtifact(db, {
    artifactId: artifact.id, state: 'purged' }), /gel-juridique/);

  const message = await outbox.enqueue(db, { projectId: 'foundation', operationId: operation.id,
    channel: 'conversation', kind: 'recovery', dedupeKey: 'recovery:1', payload: { state: 'started' } });
  assert.strictEqual((await outbox.enqueue(db, { projectId: 'foundation', operationId: operation.id,
    channel: 'conversation', kind: 'recovery', dedupeKey: 'recovery:1',
    payload: { state: 'started' } })).id, message.id);
  await assert.rejects(outbox.enqueue(db, { projectId: 'foundation', channel: 'conversation',
    kind: 'recovery', dedupeKey: 'recovery:1', payload: { state: 'different' } }), /idempotence-conflit/);
  assert.strictEqual((await outbox.listDeliverable(db, 'foundation')).length, 1);
  await db.close();
}

async function main() {
  const migrated = migrateProjectConfig(legacyConfig());
  assert.strictEqual(validateProjectConfig(migrated).ok, true);
  assert.strictEqual(validateProjectConfig(legacyConfig()).ok, false);
  await testMigration();
  await testStores();
  console.log('Ontogenesis durable foundation checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
