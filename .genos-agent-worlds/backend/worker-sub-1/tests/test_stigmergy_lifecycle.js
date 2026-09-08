const assert = require('assert');
const { getDatabase } = require('../src/db');
const collective = require('../src/services/primitiveHandlers/collective');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');
const dynOrg = require('../src/services/dynamicOrganizationService');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTests() {
  console.log('--- Starting Stigmergy Lifecycle Integration Tests ---');
  const db = await getDatabase();
  const orchestratorId = 'orch-stigmergy-' + Date.now();
  const agentId = orchestratorId;

  // 1. Insert orchestrator in agents table
  await db.run(
    "INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, 'Stigmergy Root', 'orchestrator', 'running', 'orchestrator')",
    orchestratorId
  );

  // 2. Setup dynamic organization for stigmergic trials
  await dynOrg.changeOrganization(db, {
    orchestratorId,
    organization: 'stigmergy',
    reason: 'Stigmergy lifecycle testing',
    changedBy: orchestratorId
  });

  const stateV1 = await dynOrg.getState(db, orchestratorId);
  assert(stateV1, 'Organization should be initialized');
  assert.strictEqual(stateV1.version, 1, 'Initial organization version should be 1');
  console.log('✔ Organization initialized (version 1: stigmergy)');

  // 3. Deposit attractive and repellent pheromones in version 1
  const dep1 = await strategyAdapter.executePrimitive('pheromone_deposit', {
    orchestratorId,
    agentId,
    path: 'path_optimal',
    strength: 0.9
  });
  assert(dep1.success, 'Deposit on path_optimal should succeed');
  assert.strictEqual(dep1.isRepellent, false, 'path_optimal should be attractive');

  const dep2 = await strategyAdapter.executePrimitive('pheromone_deposit', {
    orchestratorId,
    agentId,
    path: 'path_suboptimal',
    strength: 0.3
  });
  assert(dep2.success, 'Deposit on path_suboptimal should succeed');

  const dep3 = await strategyAdapter.executePrimitive('pheromone_deposit', {
    orchestratorId,
    agentId,
    path: 'path_dead_end',
    strength: 0.8,
    isRepellent: true
  });
  assert(dep3.success, 'Deposit of repellent should succeed');
  assert.strictEqual(dep3.isRepellent, true, 'path_dead_end should be marked repellent');
  console.log('✔ Pheromone deposits (attractive & repellent) completed');

  // 4. Organization transition to Version 2: Stigmergy must NOT suffer version amnesia
  await dynOrg.changeOrganization(db, {
    orchestratorId,
    organization: 'mycelial_routing',
    reason: 'Switching organization to mycelial_routing',
    changedBy: orchestratorId
  });
  const stateV2 = await dynOrg.getState(db, orchestratorId);
  assert.strictEqual(stateV2.version, 2, 'Organization version should have incremented to 2');

  const trailSelCrossVersion = await strategyAdapter.executePrimitive('trail_selection', {
    orchestratorId
  });
  assert(trailSelCrossVersion.success, 'Trail selection across versions should succeed');
  assert(trailSelCrossVersion.trailStrengths['path_optimal'] > 0, 'path_optimal must be retained in version 2');
  assert(trailSelCrossVersion.trailStrengths['path_dead_end'] < 0, 'path_dead_end must retain negative strength');
  assert.strictEqual(trailSelCrossVersion.selectedTrail, 'path_optimal', 'Greedy selection should select path_optimal');
  console.log('✔ Environmental stigmergy persists across organization version transitions');

  // 5. ACO Probabilistic and Softmax Selection
  const acoSelection = await strategyAdapter.executePrimitive('trail_selection', {
    orchestratorId,
    mode: 'probabilistic',
    alpha: 2.0,
    excludeRepellent: true
  });
  assert(acoSelection.success, 'ACO selection should succeed');
  assert(acoSelection.trailProbabilities['path_optimal'] > acoSelection.trailProbabilities['path_suboptimal'], 'Optimal path should have higher probability under ACO');
  assert.strictEqual(acoSelection.trailProbabilities['path_dead_end'], undefined, 'Repellent path should be excluded when requested');
  console.log('✔ ACO probabilistic path selection and repellent exclusion verified');

  // 6. Active Evaporation & Physical Database Purge
  const futureRef = Date.now() + (3600 * 1000 * 24);
  const evapResult = await strategyAdapter.executePrimitive('evaporation', {
    orchestratorId,
    referenceTime: futureRef,
    evaporationHalfLifeMs: 3600 * 1000,
    pruneThreshold: 0.001
  });
  assert(evapResult.success, 'Evaporation execution should succeed');
  assert(evapResult.purgedTracesCount >= 3, 'Traces should be purged after 24 half-lives');
  console.log(`✔ Evaporation cycle successfully purged ${evapResult.purgedTracesCount} expired traces`);

  const remainingInDb = await db.get(
    "SELECT COUNT(*) as count FROM agent_organization_messages WHERE orchestrator_id = ? AND kind = 'trace'",
    orchestratorId
  );
  assert.strictEqual(remainingInDb.count, 0, 'All expired traces should be physically deleted from database');
  console.log('✔ Physical database cleanup confirmed');

  // 7. MCP BioTools Integration Check
  const mcpDeposit = await executeBioTool('genos_biomimicry_stigmergy', {
    agent_id: 'agent_mcp_test',
    target_file: 'src/core/engine.rs',
    pheromone_type: 'trail',
    amount: 1.5
  });
  assert(mcpDeposit.success, 'MCP stigmergy deposit should succeed');

  const mcpRead = await executeBioTool('genos_biomimicry_stigmergy', {
    action: 'read',
    agent_id: 'agent_mcp_test',
    target_file: 'src/core/engine.rs'
  });
  assert(mcpRead.success, 'MCP stigmergy read should succeed');
  const readOutput = JSON.parse(mcpRead.output);
  assert(readOutput.intensity >= 1.5, 'Read intensity should match or exceed deposited amount');

  const mcpEvap = await executeBioTool('genos_biomimicry_stigmergy', {
    action: 'evaporate',
    agent_id: 'agent_mcp_test',
    dt_seconds: 1.0
  });
  assert(mcpEvap.success, 'MCP stigmergy evaporate should succeed');
  console.log('✔ MCP Biomimicry Stigmergy tools (deposit/read/evaporate) verified');

  console.log('--- All Stigmergy Lifecycle Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
