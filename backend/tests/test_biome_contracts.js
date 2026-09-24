const assert = require('node:assert/strict');
const { createBiomeState } = require('../src/services/biome/biomeStore');
const { createIndividual } = require('../src/services/biome/contracts/individual');
const { createEcologicalEvent } = require('../src/services/biome/contracts/ecologicalEvent');
const environmentModel = require('../src/services/biome/environment/environmentModelService');
const biome = require('../src/services/biomeCoordinationService');

const state = createBiomeState({
  biomeId: 'biome-contracts', missionId: 'mission-1', scope: 'workspace',
  environment: { environmentId: 'env-1', version: 3, currentPhase: 'verification' },
  niches: [{ nicheId: 'niche-tests', status: 'open', opportunityScore: 0.7 }],
  populations: [{ populationId: 'population-tests', nicheId: 'niche-tests', individuals: [{ individualId: 'worker-1' }] }],
  resourcePool: { tokens: 80, verificationBudget: 5 },
  interactionGraph: [{ sourceId: 'search', targetId: 'verify', type: 'mutualism', strength: 0.8 }]
});

assert.equal(state.scope, 'workspace');
assert.equal(state.environment.version, 3);
assert.equal(state.niches[0].status, 'open');
assert.equal(state.populations[0].individuals[0].individualId, 'worker-1');
assert.equal(state.resourcePool.tokens, 80);
assert.equal(state.interactionGraph[0].type, 'mutualism');
assert.deepEqual(createIndividual({ individualId: 'worker-2' }).fitnessReceipts, []);
assert.throws(() => createBiomeState({ biomeId: 'bad', scope: 'invalid' }), { code: 'BIOME_CONTRACT_INVALID' });
assert.throws(() => createBiomeState({ biomeId: 'bad', resourcePool: { tokens: -1 } }), { code: 'BIOME_CONTRACT_INVALID' });

const event = createEcologicalEvent({ operationId: 'op-1', sessionId: 'session-1', actorId: 'worker-2' });
assert.equal(event.actorId, 'worker-2');
assert.ok(event.timestamp);
const mappedEnvironment = environmentModel.createEnvironmentModel({
  environmentId: 'env-map', mission: 'Find the regression.',
  environment: {
    constraints: [{ id: 'token-cap', resource: 'tokens', maximum: 5, blocking: true }],
    opportunities: [
      { id: 'logs', descriptor: 'Inspect runtime logs', opportunityScore: 0.8, evidenceRefs: ['artifact:logs'] },
      { id: 'guess', descriptor: 'Unverified idea', opportunityScore: 0.9 }
    ]
  }
});
assert.equal(mappedEnvironment.environment.version, 1);
assert.equal(mappedEnvironment.environment.unresolvedProblems[0].description, 'Find the regression.');
assert.equal(mappedEnvironment.opportunities[0].status, 'candidate');
assert.equal(mappedEnvironment.opportunities[1].status, 'insufficient_evidence');
assert.equal(mappedEnvironment.constraints.evaluations[0].status, 'unmeasurable');
const versioned = environmentModel.applyEnvironmentUpdate({
  environment: mappedEnvironment.environment, patch: { currentPhase: 'verification' }, reason: 'phase shift'
});
assert.equal(versioned.environment.version, 2);
assert.deepEqual(versioned.receipt.changedFields, ['currentPhase']);

async function checkPersistence() {
  const db = fakeDatabase();
  const session = await biome.composeBiome('Persist canonical biome state.', { db });
  const result = await biome.allocateSessionResources(session.sessionId, [
    { id: 'population-a', demand: 1, priority: 1 }
  ], { db, actorId: 'allocator', totalBudget: 12 });
  assert.equal(result.receipt.previousRevision, 0);
  assert.equal(result.receipt.resultingRevision, 1);
  assert.equal(db.state.events[0].event_type, 'allocate');
  assert.equal(JSON.parse(db.state.events[0].payload_json).actorId, 'allocator');
  const updated = await biome.updateSessionEnvironment(session.sessionId, {
    opportunities: [{ id: 'logs', evidenceRefs: ['artifact:logs'], opportunityScore: 0.8 }]
  }, { db, actorId: 'mapper', reason: 'logs discovered', evidenceRefs: ['artifact:logs'] });
  assert.equal(updated.environment.version, 2);
  assert.equal(updated.receipt.resultingRevision, 2);
  assert.equal(db.state.events[1].event_type, 'environment');
  const snapshot = await biome.sessionSnapshot(session.sessionId, { db });
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.environment.version, 2);
  assert.equal(snapshot.opportunities[0].status, 'candidate');
}

function fakeDatabase() {
  const state = { rows: new Map(), events: [] };
  return {
    state,
    run: async (sql, ...params) => runStatement(state, sql, params),
    get: async (_sql, id) => state.rows.get(id),
    all: async () => [{ name: 'revision' }]
  };
}

function runStatement(state, sql, params) {
  const query = String(sql).toUpperCase();
  if (query.startsWith('INSERT INTO TOPOLOGY_SESSIONS')) return insertBiome(state, params);
  if (query.startsWith('UPDATE TOPOLOGY_SESSIONS')) return updateBiome(state, params);
  if (query.startsWith('INSERT INTO TOPOLOGY_SESSION_EVENTS')) return insertBiomeEvent(state, params);
  return { changes: 0 };
}

function insertBiome(state, params) {
  if (state.rows.has(params[0])) return { changes: 0 };
  state.rows.set(params[0], { topology: 'biome', state_json: params[1], revision: 0 });
  return { changes: 1 };
}

function updateBiome(state, params) {
  const row = state.rows.get(params[2]);
  if (!row || row.revision !== params[3]) return { changes: 0 };
  state.rows.set(params[2], { ...row, state_json: params[0], revision: params[1] });
  return { changes: 1 };
}

function insertBiomeEvent(state, params) {
  state.events.push({ session_id: params[0], revision: params[1], event_type: params[2], payload_json: params[3] });
  return { changes: 1 };
}

checkPersistence().then(() => console.log('Biome contract and persistence checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
