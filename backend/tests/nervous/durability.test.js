'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { observation } = require('../../src/services/nervous/contract');
const { NOW, SCOPE, harness, event } = require('./helpers');

test('SQLite transaction persists state, receipt and proposals; retry does not double them', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const item = event('retry', { eventType: 'AGENT_FAILED' });
  const first = await h.runtime.ingest(item, SCOPE);
  const second = await h.runtime.ingest(item, SCOPE);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.receipt, first.receipt);
  assert.equal((await h.store.effects(SCOPE)).length, 2);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_signals')).n, 1);
});

test('same identity with changed contents is a collision, not an overwrite', async t => {
  const h = await harness(); t.after(() => h.store.close());
  await h.runtime.ingest(event('collision', { payload: { resourcePressure: 0.1 } }), SCOPE);
  await assert.rejects(h.runtime.ingest(event('collision', { payload: { resourcePressure: 0.9 } }), SCOPE), /SIGNAL_ID_COLLISION/);
  assert.equal((await h.runtime.snapshot(SCOPE)).agents[0].pressure, 0.1);
});

test('tenant isolation applies to state, receipts, effects and same event identifiers', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const other = { ...SCOPE, projectId: 'other' };
  const first = await h.runtime.ingest(event('same', { eventType: 'AGENT_FAILED' }), SCOPE);
  const second = await h.runtime.ingest(event('same', { payload: { ...other, resourcePressure: 0.2 } }), other);
  assert.notEqual(first.signalId, second.signalId);
  assert.equal((await h.store.effects(other)).length, 0);
  assert.equal(await h.store.receipt(first.signalId, other), undefined);
  const proposal = (await h.store.effects(SCOPE))[0];
  assert.equal(await h.store.effect(proposal.id, other), undefined);
  assert.equal(await h.store.claim(proposal.id, other), undefined);
});

test('restart resumes a durable unprocessed signal and preserves deduplication', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-nervous-'));
  let active;
  t.after(async () => { await active?.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const filename = path.join(dir, 'nervous.sqlite');
  const first = await harness({ filename });
  active = first;
  const item = event('restart', { eventType: 'AGENT_FAILED' });
  await first.store.append(observation(item, { scope: SCOPE, now: NOW }));
  await first.store.close();
  active = null;
  const second = await harness({ filename });
  active = second;
  assert.equal(await second.runtime.drain(), 1);
  assert.equal((await second.runtime.ingest(item, SCOPE)).duplicate, true);
  assert.equal((await second.store.effects(SCOPE)).length, 2);
});

test('failure during projection rolls back state, receipt and effects while preserving pending input', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const original = h.db.run;
  let broken = true;
  h.db.run = async (sql, ...params) => {
    if (broken && sql.includes('INSERT INTO nervous_effects')) throw new Error('injected disk failure');
    return original(sql, ...params);
  };
  await assert.rejects(h.runtime.ingest(event('rollback', { eventType: 'AGENT_FAILED' }), SCOPE), /disk failure/);
  assert.equal((await h.store.states(SCOPE)).length, 0);
  assert.equal((await h.db.get('SELECT processed FROM nervous_signals')).processed, 0);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_receipts')).n, 0);
  broken = false;
  assert.equal(await h.runtime.drain(), 1);
  assert.equal((await h.store.effects(SCOPE)).length, 2);
});

test('capacity exhaustion rejects explicitly without evicting an accepted signal', async t => {
  const h = await harness({ maxSignals: 1 }); t.after(() => h.store.close());
  await h.runtime.ingest(event('retained'), SCOPE);
  await assert.rejects(h.runtime.ingest(event('overflow'), SCOPE), /NERVOUS_CAPACITY/);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_signals')).n, 1);
  assert.equal(h.runtime.stats.rejected, 1);
});

test('concurrent ingestion is serialized without nested transactions or duplicate decisions', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const tasks = Array.from({ length: 40 }, (_, i) => h.runtime.ingest(event(`parallel-${i}`), SCOPE));
  await Promise.all(tasks);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_receipts')).n, 40);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_signals WHERE processed=0')).n, 0);
});

test('a systemic wave adds monitoring proposals, not remote kill or mutation permissions', async t => {
  const h = await harness(); t.after(() => h.store.close());
  h.runtime.configureGraph(SCOPE, { nodes: [{ id: 'worker-a', scope: SCOPE }, { id: 'worker-b', scope: SCOPE }],
    edges: [{ from: 'worker-a', to: 'worker-b' }] });
  await h.runtime.ingest(event('wound', { eventType: 'AGENT_FAILED' }), SCOPE);
  const effects = (await h.store.effects(SCOPE)).map(row => JSON.parse(row.body));
  const wave = effects.find(item => item.pathway === 'SYSTEMIC_WAVE');
  assert.equal(wave.action, 'INCREASE_MONITORING');
  assert.equal(wave.target, 'worker-b');
  assert.equal(wave.evidenceStatus, 'UNVERIFIED');
});

function runWorker(data) {
  const { Worker } = require('node:worker_threads');
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'concurrency.worker.js'),
      { workerData: data, execArgv: ['--experimental-sqlite'] });
    worker.once('error', reject);
    worker.once('exit', code => code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)));
  });
}

test('independent connections on concurrent worker threads preserve all decisions', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-nervous-concurrent-'));
  let active;
  t.after(async () => { await active?.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const filename = path.join(dir, 'shared.sqlite');
  const initial = await harness({ filename }); await initial.store.close();
  await Promise.all([runWorker({ filename, index: 0 }), runWorker({ filename, index: 1 })]);
  const h = await harness({ filename }); active = h;
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_receipts')).n, 30);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_effects')).n, 60);
});

test('wave effect expiry is its shorter propagation TTL, not the local reflex TTL', async t => {
  const h = await harness(); t.after(() => h.store.close());
  h.runtime.configureGraph(SCOPE, { nodes: [{ id: 'worker-a', scope: SCOPE }, { id: 'n', scope: SCOPE }],
    edges: [{ from: 'worker-a', to: 'n' }] });
  const result = await h.runtime.ingest(event('wave-ttl', { eventType: 'AGENT_FAILED' }), SCOPE);
  const effects = (await h.store.effects(SCOPE)).map(row => JSON.parse(row.body));
  assert.equal(effects.find(item => item.pathway === 'SYSTEMIC_WAVE').expiresAt, NOW + 15000);
  assert.equal(result.receipt.graphHash.length, 64);
});
