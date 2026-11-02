'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./gnsFixture');
const { SCOPE, event } = require('./helpers');
const { runMorphogenesisRuntime } = require('../../src/services/morphogenesis/runtime/morphogenesisRuntimeV2');
const { createShadowServices, runMorphogenesisShadow } = require('../../src/services/morphogenesis/runtime/morphogenesisShadowAdapter');
const { planMorphogenesis } = require('../../src/services/morphogenesis/morphogenesisPlannerService');

function plan() {
  return planMorphogenesis({ missionId: 'gns-morphogenesis',
    currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: 'a_team', budget: { tokens: 30000 } });
}

test('the shadow pipeline carries scoped GNS pressure into diagnosis, needs and a proposal', async t => {
  const h = await fixture(t);
  const accepted = await h.runtime.ingest(event('pressure', { payload: { resourcePressure: 0.9 } }), SCOPE);
  const result = await runMorphogenesisShadow(plan(), { db: h.db, agentId: 'worker-a' });
  assert.equal(result.decision, 'SHADOWED');
  const requests = result.proposal.operationalNeeds;
  assert.deepEqual(requests.map(item => item.kind), ['REEVALUATE_TOPOLOGY', 'REALLOCATE_WORKERS']);
  assert.equal(requests[0].signalId, accepted.signalId);
  assert.equal(requests[1].sourceEventId, 'pressure');
  assert.equal(requests[1].pressure, 0.9);
  assert.equal(requests[0].executionAuthorized, false);
  assert.equal(result.proposal.executionAuthorized, false);
  assert.equal(result.committed, false);
  assert.deepEqual(result.evaluation.needs.operationalNeeds, requests);
});

test('GNS does not bypass hard constraints or invoke a transition', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('urgent', { eventType: 'AGENT_FAILED' }), SCOPE);
  let transitions = 0;
  const services = { ...createShadowServices(), hardGate: async () => ({ passed: false }),
    kernel: { adjudicate: async () => assert.fail('kernel must not be reached') },
    governance: async () => ({ allowed: true }), transition: async () => { transitions++; },
    credit: async () => ({}), memory: async () => ({}) };
  const result = await runMorphogenesisRuntime({ db: h.db, agentId: 'worker-a',
    morphogenesisPlan: plan() }, services);
  assert.equal(result.decision, 'REJECTED');
  assert.equal(result.evaluation.reason, 'hard_constraint_gate_failed');
  assert.equal(result.evaluation.needs.operationalNeeds.length, 1);
  assert.equal(transitions, 0);
});

test('a GNS need cannot supply the missing kernel approval for a topology change', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('nociception', { eventType: 'AGENT_FAILED' }), SCOPE);
  const services = { ...createShadowServices(),
    kernel: { adjudicate: async () => ({ valid: false, decision: 'REJECT' }) },
    governance: async () => assert.fail('governance must not run'),
    transition: async () => assert.fail('transition must not run'),
    credit: async () => ({}), memory: async () => ({}) };
  const result = await runMorphogenesisRuntime({ db: h.db, agentId: 'worker-a',
    morphogenesisPlan: plan() }, services);
  assert.equal(result.decision, 'REJECTED');
  assert.equal(result.committed, false);
  assert.equal(result.evaluation.proposal.operationalNeeds[0].evidenceStatus, 'UNVERIFIED');
});

test('expired and disabled signals do not produce morphogenetic needs', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('old', { payload: { resourcePressure: 1 } }), SCOPE);
  h.time.now += 30001;
  const expired = await runMorphogenesisShadow(plan(), { db: h.db, agentId: 'worker-a' });
  assert.deepEqual(expired.proposal.operationalNeeds, []);
  process.env.GENOS_NERVOUS_ENABLED = '0';
  const disabled = await runMorphogenesisShadow(plan(), { db: h.db, agentId: 'worker-a' });
  assert.deepEqual(disabled.proposal.operationalNeeds, []);
});

test('caller scope cannot import a foreign project into the morphogenetic diagnosis', async t => {
  const h = await fixture(t);
  const foreign = { ...SCOPE, projectId: 'private' };
  await h.runtime.ingest(event('private', { eventType: 'AGENT_FAILED', payload: foreign }), foreign);
  const result = await runMorphogenesisRuntime({ db: h.db, agentId: 'worker-a',
    scope: foreign, mode: 'shadow', morphogenesisPlan: plan() }, createShadowServices());
  assert.deepEqual(result.proposal.operationalNeeds, []);
});

test('morphogenesis considers only the persisted orchestration subtree, not another mission', async t => {
  const h = await fixture(t);
  await h.db.exec(`INSERT INTO agents VALUES('child','workspace-a','worker-a');
    INSERT INTO agents VALUES('peer','workspace-a',NULL)`);
  await h.runtime.ingest(event('own-child', { agentId: 'child', eventType: 'AGENT_FAILED' }), SCOPE);
  await h.runtime.ingest(event('other-mission', { agentId: 'peer', eventType: 'AGENT_FAILED' }), SCOPE);
  const result = await runMorphogenesisShadow(plan(), { db: h.db, agentId: 'worker-a' });
  assert.deepEqual(result.proposal.operationalNeeds.map(item => item.agentId), ['child']);
});

test('a fresh moderate pressure observation does not invent an urgent reallocation need', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('moderate', { payload: { resourcePressure: 0.6 } }), SCOPE);
  const result = await runMorphogenesisShadow(plan(), { db: h.db, agentId: 'worker-a' });
  assert.deepEqual(result.proposal.operationalNeeds, []);
});

test('the registered production AGOW receiver forwards its persisted agent and database', async t => {
  const h = await fixture(t);
  await h.runtime.ingest(event('receiver-pressure', { payload: { resourcePressure: 0.9 } }), SCOPE);
  await require('../../src/services/agow/agowStatePersistenceService').save({
    db: h.db, agentId: 'worker-a', scope: 'agow_morphogenesis_plans', state: plan() });
  const registry = require('../../src/services/agow/workspaceReceiverRegistry');
  registry.clear();
  t.after(() => registry.clear());
  require('../../src/services/agow/agowDefaultReceiversService').ensureRegistered();
  const [{ handler }] = registry.list({ modules: ['morphogenesis'] });
  const result = await handler({ phase: 'consume', db: h.db, frame: { agentId: 'worker-a' } });
  assert.equal(result.consumed, true);
  assert.equal(result.outcome.committed, false);
  assert.equal(result.outcome.operationalNeeds[1].sourceEventId, 'receiver-pressure');
});

test('canonical mission membership excludes another mission under the same parent', async t => {
  const h = await fixture(t);
  await h.db.exec(`CREATE TABLE missions(mission_id TEXT,orchestrator_agent_id TEXT);
    CREATE TABLE mission_agents(mission_id TEXT,agent_id TEXT);
    INSERT INTO missions VALUES('gns-morphogenesis','worker-a');
    INSERT INTO agents VALUES('member','workspace-a','worker-a');
    INSERT INTO agents VALUES('other-mission','workspace-a','worker-a');
    INSERT INTO mission_agents VALUES('gns-morphogenesis','member');`);
  await h.runtime.ingest(event('own', { agentId: 'member', eventType: 'AGENT_FAILED' }), SCOPE);
  await h.runtime.ingest(event('unrelated', { agentId: 'other-mission', eventType: 'AGENT_FAILED' }), SCOPE);
  const result = await runMorphogenesisShadow(plan(), { db: h.db, agentId: 'worker-a' });
  assert.deepEqual(result.proposal.operationalNeeds.map(item => item.agentId), ['member']);
});
