'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGraph } = require('../../src/services/nervous/rpeAdapter');
const { SCOPE, event, saveTelemetry } = require('./helpers');
const { setup, relation } = require('./graphFixtures');
process.env.GENOS_NERVOUS_ENABLED = '1';

test('persisted failure automatically proposes monitoring through an active RPE relation', async t => {
  const h = await setup(t);
  await relation(h.source, { id: 'active' });
  const item = event('rpe-failure', { eventType: 'AGENT_FAILED', payload: { missionId: 'mission-a' } });
  await saveTelemetry(h.source, item);
  assert.equal((await h.bridge.observePersistedEvent(h.source, item)).status, 'OBSERVED');
  const effects = (await h.store.effects(SCOPE)).map(row => JSON.parse(row.body));
  const wave = effects.find(effect => effect.target === 'worker-b');
  assert.equal(wave.action, 'INCREASE_MONITORING');
  assert.equal(wave.pathway, 'SYSTEMIC_WAVE');
  assert.equal(wave.evidenceStatus, 'UNVERIFIED');
  assert.ok(effects.every(effect => effect.action !== 'TERMINATE_AGENT'));
});

test('revoked, expired, proposed, unknown and cross-tenant relations never become edges', async t => {
  const h = await setup(t);
  await relation(h.source, { id: 'revoked', metadata: { state: 'revoked' } });
  await relation(h.source, { id: 'expired', metadata: { validUntil: 1 } });
  await relation(h.source, { id: 'proposed', metadata: { state: 'proposed' } });
  await relation(h.source, { id: 'unmapped', type: 'peer' });
  await relation(h.source, { id: 'foreign', to: 'foreign' });
  const graph = await loadGraph({ db: h.source, event: event('filtered'), scope: SCOPE });
  assert.deepEqual(graph.edges, []);
  assert.ok(!graph.nodes.some(node => node.id === 'foreign'));
});

test('mission claims are checked against persisted membership and restrict graph endpoints', async t => {
  const h = await setup(t);
  await relation(h.source, { id: 'other-mission', to: 'worker-c' });
  const graph = await loadGraph({ db: h.source, event: event('same', { payload: { missionId: 'mission-a' } }), scope: SCOPE });
  assert.deepEqual(graph.edges, []);
  assert.equal(await loadGraph({ db: h.source, event: event('wrong', { payload: { missionId: 'mission-b' } }), scope: SCOPE }), null);
});

test('relation revocation takes effect on the next persisted observation without restart', async t => {
  const h = await setup(t);
  await relation(h.source, { id: 'changing' });
  const input = { db: h.source, event: event('before'), scope: SCOPE };
  assert.equal((await loadGraph(input)).edges.length, 1);
  await h.source.run('UPDATE agent_relations SET metadata_json=? WHERE id=?', '{"state":"revoked"}', 'changing');
  assert.equal((await loadGraph(input)).edges.length, 0);
});

test('disabled GNS never opens a relation database', async () => {
  process.env.GENOS_NERVOUS_ENABLED = '0';
  try { assert.equal(await loadGraph({ db: null, event: null, scope: null }), null); }
  finally { process.env.GENOS_NERVOUS_ENABLED = '1'; }
});

test('an absent mission is inferred only from unambiguous persisted membership', async t => {
  const h = await setup(t);
  await relation(h.source, { id: 'cross-mission', to: 'worker-c' });
  const input = { db: h.source, event: event('implicit-mission'), scope: SCOPE };
  assert.deepEqual((await loadGraph(input)).edges, []);
  await h.source.run('INSERT INTO mission_agents VALUES(?,?)', 'mission-b', 'worker-a');
  assert.equal(await loadGraph(input), null);
});

test('historical failures never generate fresh RPE monitoring proposals', async t => {
  const h = await setup(t);
  await relation(h.source, { id: 'historical' });
  const item = event('old-failure', { eventType: 'AGENT_FAILED' });
  await saveTelemetry(h.source, item);
  h.time.now += 31000;
  const result = await h.bridge.observePersistedEvent(h.source, item);
  assert.equal(result.receipt.disposition, 'HISTORICAL');
  assert.deepEqual(await h.store.effects(SCOPE), []);
});
