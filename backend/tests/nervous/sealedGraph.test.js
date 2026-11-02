'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SCOPE, harness, event } = require('./helpers');

function graph(target) {
  return { nodes: [{ id: 'worker-a', scope: SCOPE }, { id: target, scope: SCOPE }],
    edges: [{ from: 'worker-a', to: target }] };
}

async function targets(h, signalId) {
  return (await h.store.effects(SCOPE)).map(row => JSON.parse(row.body))
    .filter(effect => effect.signalId === signalId && effect.pathway === 'SYSTEMIC_WAVE')
    .map(effect => effect.target);
}

test('concurrent events in one project retain their own propagation graph', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const [first, second] = await Promise.all([
    h.runtime.ingest(event('mission-a', { eventType: 'AGENT_FAILED' }), SCOPE, { graph: graph('peer-a') }),
    h.runtime.ingest(event('mission-b', { eventType: 'AGENT_FAILED' }), SCOPE, { graph: graph('peer-b') })
  ]);
  assert.deepEqual(await targets(h, first.signalId), ['peer-a']);
  assert.deepEqual(await targets(h, second.signalId), ['peer-b']);
  assert.notEqual(first.receipt.graphHash, second.receipt.graphHash);
});

test('a retry after graph changes keeps the first sealed receipt and rejects changed event contents', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const item = event('retry-graph', { eventType: 'AGENT_FAILED' });
  const first = await h.runtime.ingest(item, SCOPE, { graph: graph('before') });
  const retry = await h.runtime.ingest(item, SCOPE, { graph: graph('after') });
  assert.equal(retry.duplicate, true);
  assert.deepEqual(retry.receipt, first.receipt);
  assert.deepEqual(await targets(h, first.signalId), ['before']);
  await assert.rejects(h.runtime.ingest({ ...item, severity: 'critical' }, SCOPE,
    { graph: graph('after') }), /SIGNAL_ID_COLLISION/);
});

test('an interrupted projection replays its sealed graph after reopening SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gns-sealed-graph-'));
  let active;
  t.after(async () => {
    await active?.store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const filename = path.join(directory, 'signals.sqlite');
  active = await harness({ filename });
  active.runtime.reduce = () => { throw new Error('simulated projection interruption'); };
  await assert.rejects(active.runtime.ingest(event('pending', { eventType: 'AGENT_FAILED' }),
    SCOPE, { graph: graph('original-peer') }), /interruption/);
  await active.store.close(); active = null;
  active = await harness({ filename });
  active.runtime.configureGraph(SCOPE, graph('wrong-peer'));
  assert.equal(await active.runtime.drain(), 1);
  const entry = await active.db.get('SELECT id FROM nervous_signals');
  assert.deepEqual(await targets(active, entry.id), ['original-peer']);
});

test('cross-tenant graph rejection happens before inbox acceptance', async t => {
  const h = await harness(); t.after(() => h.store.close());
  const invalid = graph('peer');
  invalid.nodes[1].scope = { ...SCOPE, organizationId: 'other' };
  await assert.rejects(h.runtime.ingest(event('cross'), SCOPE, { graph: invalid }), /CROSS_TENANT_GRAPH/);
  assert.equal((await h.db.get('SELECT count(*) AS n FROM nervous_signals')).n, 0);
});
