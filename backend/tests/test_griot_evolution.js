const assert = require('assert');
const { getDatabase } = require('../src/db');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const { handleSpeciationCheck } = require('../src/services/mcpBioTools/handlers/speciationCheck');
const { handleEvolutionAssimilatePlasmid } = require('../src/services/mcpBioTools/handlers/evolutionAssimilatePlasmid');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');

let executedCommand = '';
function mockRun(command) {
  executedCommand = command;
  return Buffer.from('success');
}

function runSpeciationTest() {
  executedCommand = '';
  handleSpeciationCheck({ agent_id: 'griot_1', divergence_threshold: 0.8 }, mockRun);
  assert.strictEqual(executedCommand.includes('speciation-check --agent-id "griot_1" --threshold "0.8"'), true);
  console.log('Speciation test passed.');
}

async function runPlasmidTest() {
  executedCommand = '';
  await handleEvolutionAssimilatePlasmid({ agent_id: 'griot_1', plasmid_id: 'plasmid_x', source_agent: 'griot_2' }, mockRun);
  assert.strictEqual(executedCommand.includes('assimilate-plasmid --agent-id "griot_1" --plasmid-id "plasmid_x" --source "griot_2"'), true);
  assert.notStrictEqual(validateToolArguments('genos_evolution_assimilate_plasmid', {}), null);
  assert.strictEqual(validateToolArguments('genos_evolution_assimilate_plasmid', { agent_id: 'griot_1', plasmid_id: 'plasmid_x' }), null);
  console.log('Plasmid assimilation test passed.');
}

async function runOrganizationSignalTest() {
  const db = await getDatabase();
  const orchestratorId = `orch-plasmid-${Date.now()}`;
  const workerId = `${orchestratorId}-worker`;
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, 'Plasmid Owner', 'orchestrator', 'running', 'orchestrator')", orchestratorId);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id) VALUES (?, 'Plasmid Worker', 'worker', 'running', 'worker', ?)", workerId, orchestratorId);
  executedCommand = '';
  const result = await handleEvolutionAssimilatePlasmid({
    agent_id: workerId,
    plasmid_id: 'plasmid_x',
    source_agent: 'donor_1',
    orchestrator_id: orchestratorId
  }, mockRun);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.transport, 'local+zero_text');
  const inbox = await dynamicOrganization.inbox(db, { orchestratorId, requesterAgentId: orchestratorId });
  const signal = inbox.messages.find((message) => message.signal?.plasmidId === 'plasmid_x');
  assert(signal, 'Assimilation metadata should be available in the owner organization inbox.');
  assert.strictEqual(signal.signalType, 'plasmid');
  assert.deepStrictEqual(signal.signal, { operation: 'assimilated', plasmidId: 'plasmid_x', recipientAgentId: workerId });
  assert.strictEqual(JSON.stringify(signal.signal).includes('plasmid_code'), false);
  console.log('Plasmid assimilation organization signal test passed.');
}

async function runUnownedOrganizationTest() {
  const db = await getDatabase();
  const orchestratorId = `orch-plasmid-denied-${Date.now()}`;
  const workerId = `${orchestratorId}-worker`;
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, 'Plasmid Owner', 'orchestrator', 'running', 'orchestrator')", orchestratorId);
  executedCommand = '';
  const result = await handleEvolutionAssimilatePlasmid({
    agent_id: workerId,
    plasmid_id: 'plasmid_x',
    orchestrator_id: orchestratorId
  }, mockRun).catch((error) => ({ success: false, error: error.message }));
  assert.strictEqual(result.success, false);
  assert.strictEqual(executedCommand, '', 'Local assimilation must not run for a non-member.');
  console.log('Plasmid assimilation rejects non-members before local execution.');
}

runSpeciationTest();
Promise.resolve().then(runPlasmidTest).then(runOrganizationSignalTest).then(runUnownedOrganizationTest).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
