/**
 * Test Suite: Stigmergy, Trail Selection, Evaporation & Repellent Pheromones
 * Verifies:
 * 1. Accurate UTC exponential evaporation at t=0 without timezone offset lag
 * 2. Deterministic greedy vs stochastic selection (Softmax, Roulette, Epsilon-greedy)
 * 3. Active evaporation primitive purging traces below prune threshold
 * 4. Negative and repellent pheromones steering swarms away from dead ends
 * 5. Multi-version persistence across organization revision transitions
 * 6. Full strategyExecutionAdapter primitive dispatch
 */

const assert = require('assert');
const { getDatabase } = require('../src/db');
const dynOrg = require('../src/services/dynamicOrganizationService');
const collectivePrimitives = require('../src/services/primitiveHandlers/collective');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');

let passedTests = 0;
function pass(msg) {
  passedTests++;
  console.log('  ✅ PASS: ' + msg);
}

async function runStigmergySuite() {
  console.log('========================================================================');
  console.log('  TEST SUITE: STIGMERGY, TRAIL SELECTION & SWARM FORAGING               ');
  console.log('========================================================================\n');

  const db = await getDatabase();
  const testOrgId = 'orch-stigmergy-' + Date.now();
  const worker1 = 'agent-forager-1-' + Date.now();
  const worker2 = 'agent-forager-2-' + Date.now();

  // Create orchestrator and worker agents in database
  await db.run("INSERT OR REPLACE INTO agents (id, name, role, execution_mode, status) VALUES (?, ?, 'orchestrator', 'orchestrator', 'idle')", testOrgId, testOrgId);
  await db.run("INSERT OR REPLACE INTO agents (id, name, role, execution_mode, status, parent_agent_id) VALUES (?, ?, 'worker', 'worker', 'idle', ?)", worker1, worker1, testOrgId);
  await db.run("INSERT OR REPLACE INTO agents (id, name, role, execution_mode, status, parent_agent_id) VALUES (?, ?, 'worker', 'worker', 'idle', ?)", worker2, worker2, testOrgId);

  // Initialize stigmergy dynamic organization
  await dynOrg.changeOrganization(db, {
    orchestratorId: testOrgId,
    organization: 'stigmergy',
    reason: 'Initialize stigmergy for trail tests'
  });

  // --- 1. Evaporation temporelle exacte UTC ---
  console.log('--- 1. Evaporation temporelle exacte UTC à t=0 ---');
  const pathA = 'artifacts/solution_a.rs';
  const pathB = 'artifacts/solution_b.rs';

  const depositRes = await collectivePrimitives.pheromoneDeposit({
    orchestratorId: testOrgId,
    agentId: worker1,
    path: pathA,
    strength: 1.0
  });
  assert(depositRes.success, 'pheromoneDeposit should succeed');

  // Query message to verify creation date
  const msgRow = await db.get(
    'SELECT created_at FROM agent_organization_messages WHERE id = ?',
    depositRes.messageId
  );
  assert(msgRow, 'Message row must exist in database');

  // Evaluate trail strength immediately (t=0)
  const selNow = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker1,
    referenceTime: msgRow.created_at,
    evaporationHalfLifeMs: 3600000
  });
  assert(selNow.success, 'trailSelection at t=0 should succeed');
  assert(
    Math.abs(selNow.trailStrengths[pathA] - 1.0) < 0.05,
    'Strength at t=0 must be ~1.0, got ' + selNow.trailStrengths[pathA]
  );

  // Evaluate after exactly 1 half-life (1 hour later)
  const oneHourLater = new Date(new Date(msgRow.created_at.replace(' ', 'T') + 'Z').getTime() + 3600000).toISOString();
  const sel1h = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker1,
    referenceTime: oneHourLater,
    evaporationHalfLifeMs: 3600000
  });
  assert(
    Math.abs(sel1h.trailStrengths[pathA] - 0.5) < 0.05,
    'Strength at t=1h must be ~0.5, got ' + sel1h.trailStrengths[pathA]
  );
  pass('Evaporation temporelle exponentielle UTC exacte sans décalage de timezone');

  // --- 2. Modes de sélection déterministe vs stochastique ---
  console.log('--- 2. Sélection déterministe (Greedy) vs Stochastique (Softmax, Roulette, Epsilon-greedy) ---');
  await collectivePrimitives.pheromoneDeposit({
    orchestratorId: testOrgId,
    agentId: worker2,
    path: pathB,
    strength: 0.8
  });

  // Mode Greedy
  const selGreedy = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker1,
    mode: 'greedy'
  });
  assert.strictEqual(selGreedy.selectedTrail, pathA, 'Greedy should select highest strength pathA');
  assert.strictEqual(selGreedy.trailProbabilities[pathA], 1.0);
  assert.strictEqual(selGreedy.trailProbabilities[pathB], 0.0);
  pass('Mode Greedy sélectionne fidèlement le maximum avec probabilité 1.0');

  // Mode Softmax
  const selSoftmax = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker1,
    mode: 'softmax',
    temperature: 1.0
  });
  assert(selSoftmax.trailProbabilities[pathA] > selSoftmax.trailProbabilities[pathB]);
  assert(selSoftmax.trailProbabilities[pathB] > 0.3);
  const probSum = Object.values(selSoftmax.trailProbabilities).reduce((a, b) => a + b, 0);
  assert(Math.abs(probSum - 1.0) < 0.001);
  pass('Mode Softmax génère une distribution exploratoire valide');

  // Mode Epsilon-Greedy
  const selEpsilon = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker1,
    mode: 'epsilon_greedy',
    epsilon: 0.2
  });
  assert(selEpsilon.trailProbabilities[pathA] > 0.85);
  assert(selEpsilon.trailProbabilities[pathB] > 0.05);
  pass('Mode Epsilon-Greedy équilibre exploitation et exploration');

  // --- 3. Primitive active evaporation & purge des traces obsolètes ---
  console.log('--- 3. Primitive active evaporation & purge des traces obsolètes ---');
  const obsoletePath = 'artifacts/dead_trail_obsolete.rs';
  const depObs = await collectivePrimitives.pheromoneDeposit({
    orchestratorId: testOrgId,
    agentId: worker1,
    path: obsoletePath,
    strength: 0.1
  });

  // Reference time 24 hours into the future: strength ~ 0.1 * 0.5^24 ~ 0
  const futureRef = Date.now() + 24 * 3600000;
  const evapRes = await collectivePrimitives.evaporation({
    orchestratorId: testOrgId,
    referenceTime: futureRef,
    pruneThreshold: 0.001,
    evaporationHalfLifeMs: 3600000
  });
  assert(evapRes.success, 'evaporation primitive must succeed');
  assert(evapRes.purgedTracesCount >= 1, 'Should have purged at least 1 expired trace');

  // Confirm row was deleted from DB
  const deletedCheck = await db.get(
    'SELECT id FROM agent_organization_messages WHERE id = ?',
    depObs.messageId
  );
  assert(!deletedCheck, 'Expired trace message must be purged from database');
  pass('Primitive evaporation a purgé physiquement les traces inférieures au seuil');

  // --- 4. Phéromones répulsives / négatives ---
  console.log('--- 4. Phéromones négatives & répulsives anti-impasse ---');
  const deadEnd = 'artifacts/buggy_loop.rs';
  const repDep = await collectivePrimitives.pheromoneDeposit({
    orchestratorId: testOrgId,
    agentId: worker1,
    path: deadEnd,
    strength: -0.9,
    isRepellent: true
  });
  assert(repDep.success, 'repellent pheromone deposit should succeed');
  assert(repDep.isRepellent, 'isRepellent must be flagged true');
  assert(repDep.strength < 0, 'strength must be negative');

  const selRep = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker2,
    excludeRepellent: true
  });
  assert(selRep.repellentTrails.includes(deadEnd), 'deadEnd must be listed in repellentTrails');
  assert.notStrictEqual(selRep.selectedTrail, deadEnd, 'Trail selection with excludeRepellent must avoid dead end');
  pass('Phéromones répulsives enregistrées et évitées lors de la sélection de piste');

  // --- 5. Persistance multi-version de la mémoire stigmergique ---
  console.log('--- 5. Persistance multi-version de la mémoire stigmergique ---');
  await collectivePrimitives.pheromoneDeposit({
    orchestratorId: testOrgId,
    agentId: worker1,
    path: pathA,
    strength: 0.8
  });
  await db.run(
    'UPDATE agent_organization_state SET version = version + 1 WHERE orchestrator_id = ?',
    testOrgId
  );
  const stateV2 = await dynOrg.getState(db, testOrgId);
  assert(stateV2.version >= 2, 'Organization version should be updated to v2');

  const selV2 = await collectivePrimitives.trailSelection({
    orchestratorId: testOrgId,
    agentId: worker1,
    allVersions: true
  });
  assert(selV2.success, 'trailSelection across versions should succeed');
  assert(selV2.trailStrengths[pathA] > 0, 'pathA pheromone must persist across organization version bump');
  pass('Mémoire stigmergique découplée et préservée à travers les incréments de version');

  // --- 6. Exécution via strategyExecutionAdapter ---
  console.log('--- 6. Exécution des primitives via strategyExecutionAdapter ---');
  const adaptDep = await strategyAdapter.executePrimitive('pheromone_deposit', {
    orchestratorId: testOrgId,
    agentId: worker1,
    path: 'artifacts/adapter_test.rs',
    strength: 0.95
  });
  assert(adaptDep.success, 'Adapter execution of pheromone_deposit should succeed');

  const adaptSel = await strategyAdapter.executePrimitive('trail_selection', {
    orchestratorId: testOrgId,
    agentId: worker2,
    mode: 'greedy'
  });
  assert(adaptSel.success, 'Adapter execution of trail_selection should succeed');
  assert(adaptSel.selectedTrail, 'Must select an active trail via adapter');

  const adaptEvap = await strategyAdapter.executePrimitive('evaporation', {
    orchestratorId: testOrgId,
    dryRun: true
  });
  assert(adaptEvap.success, 'Adapter execution of evaporation should succeed');
  pass('Primitives stigmergiques complètement intégrées et fonctionnelles dans strategyExecutionAdapter');

  console.log('\n========================================================================');
  console.log('  ALL ' + passedTests + ' STIGMERGY & TRAIL SELECTION TESTS PASSED!');
  console.log('========================================================================\n');
}

runStigmergySuite().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
