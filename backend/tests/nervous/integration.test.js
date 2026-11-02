'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const { RuntimeBridge, sourceDatabasePath } = require('../../src/services/nervous/runtimeBridge');
const { SCOPE, connection, harness, event, telemetryDatabase, saveTelemetry } = require('./helpers');

async function setup(t) {
  const h = await harness();
  const source = await telemetryDatabase();
  const bridge = new RuntimeBridge({ enabled: () => true, openRuntime: async () => h.runtime });
  t.after(async () => { await bridge.shutdown(); await source.close(); });
  return { ...h, source, bridge };
}

test('bridge consumes only persisted, scope-matched canonical rows', async t => {
  const h = await setup(t);
  const item = event('persisted', { eventType: 'AGENT_FAILED' });
  assert.equal((await h.bridge.observePersistedEvent(h.source, item)).status, 'NOT_PERSISTED');
  await saveTelemetry(h.source, item);
  const tampered = { ...item, eventType: 'AGENT_COMPLETED' };
  assert.equal((await h.bridge.observePersistedEvent(h.source, tampered)).status, 'OBSERVED');
  assert.equal((await h.store.effects(SCOPE)).length, 2);
});

test('disabled bridge never opens storage and unavailable sidecar does not delete telemetry', async t => {
  const source = await telemetryDatabase(); t.after(() => source.close());
  const disabled = new RuntimeBridge({ enabled: () => false, openRuntime: () => assert.fail('disabled') });
  assert.equal((await disabled.observePersistedEvent(source, event('off'))).status, 'DISABLED');
  const broken = new RuntimeBridge({ enabled: () => true, openRuntime: async () => { throw new Error('disk unavailable'); } });
  const item = event('safe'); await saveTelemetry(source, item);
  assert.equal((await broken.observePersistedEvent(source, item)).status, 'UNAVAILABLE');
  assert.equal(broken.stats.failures, 1);
  assert.equal((await source.get('SELECT count(*) AS n FROM telemetry_events')).n, 1);
});

test('backfill retries missed delivery without duplicating effects or crossing tenants', async t => {
  const h = await setup(t);
  const item = event('backfill', { eventType: 'AGENT_FAILED' });
  await saveTelemetry(h.source, item);
  const other = { ...SCOPE, projectId: 'other' };
  await saveTelemetry(h.source, event('private', { payload: other }));
  const first = await h.bridge.backfill(h.source, { scope: SCOPE });
  const second = await h.bridge.backfill(h.source, { scope: SCOPE });
  assert.equal(first.scanned, 1);
  assert.equal(second.scanned, 1);
  assert.equal((await h.store.effects(SCOPE)).length, 2);
  assert.equal((await h.store.states(other)).length, 0);
});

function persistenceModule(source, bridge) {
  const filename = path.resolve(__dirname, '../../src/services/telemetryPersist.js');
  const module = { exports: {} };
  const dependencies = {
    '../db': { getDatabase: async () => source },
    './telemetryOtlpBridge': { observePersistedEvent: () => {} },
    './nervous/runtimeBridge': bridge
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => dependencies[name] || require(name), console });
  return module.exports;
}

function observer(item) {
  const tasks = [];
  return { persistQueue: [item], persistedEvents: 0, persistenceErrors: 0,
    persistenceRetryDelayMs: 250, tasks,
    deferSideEffect: fn => tasks.push(Promise.resolve().then(fn).catch(() => {})),
    persistWorkspaceMilestone: async () => {}, generateWorkspaceReadme: async () => {},
    pruneHistory: async () => {} };
}

test('real telemetryPersist SQL hook feeds the nervous system after primary persistence', async t => {
  const h = await setup(t);
  const item = { ...event('wired', { eventType: 'AGENT_FAILED' }), action: 'EXECUTE', detail: '' };
  const state = observer(item);
  await persistenceModule(h.source, h.bridge).drain(state);
  await Promise.all(state.tasks);
  assert.equal(state.persistedEvents, 1);
  assert.equal(state.persistenceErrors, 0);
  assert.equal((await h.store.effects(SCOPE)).length, 2);
  assert.equal((await h.source.get('SELECT count(*) AS n FROM provenance_records')).n, 1);
});

test('failing nervous observer cannot undo primary persistence', async t => {
  const source = await telemetryDatabase(); t.after(() => source.close());
  const state = observer({ ...event('fail-open-observation'), action: 'OBSERVE', detail: '' });
  const bridge = { observePersistedEvent: async () => { throw new Error('observer down'); } };
  await persistenceModule(source, bridge).drain(state);
  await Promise.all(state.tasks);
  assert.equal(state.persistedEvents, 1);
  assert.equal(state.persistenceErrors, 0);
  assert.equal((await source.get('SELECT count(*) AS n FROM telemetry_events')).n, 1);
});

test('operator CLI validates scope, commands and cursor before opening a database', () => {
  const { argumentsOf } = require('../../bin/genos-nervous.cjs');
  assert.equal(argumentsOf(['status', 'org-a', 'project-a']).command, 'status');
  assert.throws(() => argumentsOf(['execute', 'org-a', 'project-a']));
  assert.throws(() => argumentsOf(['status', '', 'project-a']));
  assert.throws(() => argumentsOf(['backfill', 'org-a', 'project-a', '-1']));
});

test('sidecar follows the actual source connection, not a process-global database path', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nervous-source-'));
  const a = connection(path.join(dir, 'a.sqlite'));
  const b = connection(path.join(dir, 'b.sqlite'));
  const memory = connection();
  t.after(async () => { await a.close(); await b.close(); await memory.close(); fs.rmSync(dir, { recursive: true }); });
  assert.equal(await sourceDatabasePath(a), path.join(dir, 'a.sqlite'));
  assert.equal(await sourceDatabasePath(b), path.join(dir, 'b.sqlite'));
  await assert.rejects(sourceDatabasePath(memory), /DURABLE_DATABASE_REQUIRED/);
});
