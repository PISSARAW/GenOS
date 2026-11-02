'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bridge = require('../../src/services/nervous/runtimeBridge');
const { readContext } = require('../../src/services/nervous/consumerContext');
const { NOW, SCOPE, harness, event, connection, saveTelemetry } = require('./helpers');

function enable(t, value = '1') {
  const previous = process.env.GENOS_NERVOUS_ENABLED;
  process.env.GENOS_NERVOUS_ENABLED = value;
  t.after(() => {
    if (previous === undefined) delete process.env.GENOS_NERVOUS_ENABLED;
    else process.env.GENOS_NERVOUS_ENABLED = previous;
  });
}

async function fixture(t) {
  enable(t);
  const h = await harness();
  bridge.runtimes.set(h.db, Promise.resolve(h.runtime));
  t.after(async () => { bridge.runtimes.delete(h.db); await h.store.close(); });
  return h;
}

test('disabled consumers do not open a database or interpret caller scope', async t => {
  enable(t, '0');
  assert.deepEqual(await readContext(), {
    status: 'DISABLED', agents: [], history: [], evidenceStatus: 'UNVERIFIED'
  });
});

test('consumer context cites processed SQLite receipts and excludes free event content', async t => {
  const h = await fixture(t);
  const accepted = await h.runtime.ingest(event('pressure', {
    payload: { resourcePressure: 0.9, secret: 'never-copy', prompt: 'private' }
  }), SCOPE);
  const result = await readContext({ db: h.db, scope: SCOPE, agentIds: ['worker-a'] });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.agents[0].pressure, 0.9);
  assert.equal(result.agents[0].source.signalId, accepted.signalId);
  assert.deepEqual(result.history[0].receipt, accepted.receipt);
  assert.equal(result.agents[0].source.evidenceStatus, 'UNVERIFIED');
  assert.equal(JSON.stringify(result).includes('never-copy'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('history filters tenants and agents before applying the requested bound', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('wanted', { payload: { resourcePressure: 0.9 } }), SCOPE);
  await h.runtime.ingest(event('other-agent', { agentId: 'worker-b' }), SCOPE);
  const other = { ...SCOPE, organizationId: 'org-b' };
  await h.runtime.ingest(event('private', { payload: other }), other);
  const result = await readContext({ db: h.db, scope: SCOPE, agentIds: ['worker-a'], limit: 1 });
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].signal.eventId, 'wanted');
  assert.deepEqual(result.agents.map(agent => agent.agentId), ['worker-a']);
  assert.equal((await readContext({ db: h.db, scope: SCOPE, agentIds: [] })).history.length, 0);
});

test('expired observations remain historical without becoming a current pressure source', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('old', { payload: { resourcePressure: 0.9 } }), SCOPE);
  h.time.now += 30001;
  const result = await readContext({ db: h.db, scope: SCOPE });
  assert.equal(result.agents[0].mode, 'UNKNOWN');
  assert.equal(result.agents[0].pressure, null);
  assert.equal(result.agents[0].source, null);
  assert.equal(result.history[0].signal.eventId, 'old');
});

test('missing scope, unavailable source and unbounded history fail closed', async t => {
  const h = await fixture(t);
  for (const request of [{ db: h.db }, { scope: SCOPE },
    { db: h.db, scope: SCOPE, limit: 1001 }, { db: h.db, scope: SCOPE, agentIds: ['bad id'] }]) {
    const result = await readContext(request);
    assert.equal(result.status, 'UNAVAILABLE');
    assert.deepEqual(result.history, []);
  }
});

test('production sqlite3 sidecar feeds the consumer from persisted telemetry', async t => {
  enable(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gns-consumer-native-'));
  const db = connection(path.join(directory, 'source.sqlite'));
  t.after(async () => {
    const runtime = await bridge.runtimes.get(db);
    if (runtime) await runtime.store.close();
    bridge.runtimes.delete(db);
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await db.exec(`CREATE TABLE telemetry_events (event_id TEXT,agent_id TEXT,event_type TEXT,
    severity TEXT,payload_json TEXT,organization_id TEXT,project_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  const item = event('native', { eventType: 'AGENT_FAILED', timestamp: new Date().toISOString() });
  await saveTelemetry(db, item);
  assert.equal((await bridge.observePersistedEvent(db, item)).status, 'OBSERVED');
  const result = await readContext({ db, scope: SCOPE });
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.agents[0].source.sourceEventId, 'native');
  assert.equal(result.agents[0].mode, 'ALERT');
  assert.ok(fs.existsSync(path.join(directory, 'source.sqlite.nervous.sqlite')));
});
