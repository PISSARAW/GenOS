'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cycle } = require('../../src/services/agow/workspaceCycleService');
const persistence = require('../../src/services/agow/agowStatePersistenceService');
const { build } = require('../../src/services/agow/candidates/candidateAdapterService');
const { validCandidate } = require('../../src/services/agow/candidateValidationService');
const { fixture } = require('./gnsFixture');
const { NOW, SCOPE, event } = require('./helpers');

async function run(h) {
  return cycle({ db: h.db, agentId: 'worker-a', now: h.time.now, ignitionThreshold: 100 });
}

async function normalCandidate(h) {
  const candidate = build({ agentId: 'worker-a', module: 'perception', now: NOW,
    observation: { candidateId: 'ordinary', goalMatched: true, confidence: 0.9 } });
  await persistence.save({ db: h.db, agentId: 'worker-a', scope: 'agow_candidate_pool',
    state: { candidates: [candidate] } });
  return candidate;
}

test('the actual AGOW cycle arbitrates a persisted GNS alert before an ordinary candidate', async t => {
  const h = await fixture(t);
  await normalCandidate(h);
  assert.equal((await run(h)).arbitration.selected[0].candidateId, 'ordinary');
  const receipt = await h.runtime.ingest(event('danger', { payload: { resourcePressure: 0.95 } }), SCOPE);
  const result = await run(h);
  const selected = result.arbitration.selected[0];
  assert.equal(selected.candidateId, `gns:${receipt.signalId}`);
  assert.equal(validCandidate(selected), true);
  assert.equal(selected.measures.urgency, 1);
  assert.equal(selected.measures.causalConfidence, 0);
  assert.equal(selected.constraints.viability, 'review');
  assert.ok(selected.evidenceRefs.includes('telemetry:danger'));
  assert.equal(result.arbitration.nervous.evidenceStatus, 'UNVERIFIED');
  assert.equal(result.broadcast, null);
});

test('a nociceptive alert without fabricated resource pressure still reaches AGOW', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('failure', { eventType: 'AGENT_FAILED' }), SCOPE);
  const result = await run(h);
  assert.equal(result.arbitration.selected.length, 1);
  assert.match(result.arbitration.selected[0].content.compactPreview, /"pressure":null/);
});

test('disabled GNS leaves arbitration unchanged even when an alert exists', async t => {
  const h = await fixture(t);
  await normalCandidate(h);
  await h.runtime.ingest(event('disabled', { eventType: 'AGENT_FAILED' }), SCOPE);
  process.env.GENOS_NERVOUS_ENABLED = '0';
  assert.equal((await run(h)).arbitration.selected[0].candidateId, 'ordinary');
});

test('expired GNS pressure cannot continue to preempt ordinary attention', async t => {
  const h = await fixture(t);
  await normalCandidate(h);
  await h.runtime.ingest(event('old', { payload: { resourcePressure: 1 } }), SCOPE);
  h.time.now += 30001;
  const result = await run(h);
  assert.equal(result.arbitration.selected[0].candidateId, 'ordinary');
  assert.deepEqual(result.arbitration.nervous.candidates, []);
});

test('AGOW ignores a caller supplied tenant and cannot read foreign or peer-agent alerts', async t => {
  const h = await fixture(t);
  const foreign = { ...SCOPE, projectId: 'private' };
  await h.runtime.ingest(event('foreign', { eventType: 'AGENT_FAILED', payload: foreign }), foreign);
  await h.runtime.ingest(event('peer', { agentId: 'worker-b', eventType: 'AGENT_FAILED' }), SCOPE);
  const result = await cycle({ db: h.db, agentId: 'worker-a', scope: foreign, now: NOW });
  assert.deepEqual(result.arbitration.selected, []);
});

test('an agent without a registered workspace does not acquire GNS context', async t => {
  const h = await fixture(t);
  await h.db.run('UPDATE agents SET workspace_id=NULL WHERE id=?', 'worker-a');
  await h.runtime.ingest(event('unscoped', { eventType: 'AGENT_FAILED' }), SCOPE);
  assert.deepEqual((await run(h)).arbitration.selected, []);
});
