const proxyquire = require('proxyquire');
const assert = require('assert');

let executedCommand = '';
const mockCp = {
  execSync: (cmd) => {
    executedCommand = cmd;
    return Buffer.from('success');
  }
};

const mcpBioTools = proxyquire('./src/services/mcpBioTools', { 'child_process': mockCp });

function runSpeciationTest() {
  executedCommand = '';
  mcpBioTools.executeBioTool('genos_biomimicry_speciation_check', { agent_id: 'griot_1', divergence_threshold: 0.8 });
  assert.strictEqual(executedCommand.includes('speciation-check --agent-id griot_1 --threshold 0.8'), true);
  console.log('Speciation test passed.');
}

function runPlasmidTest() {
  executedCommand = '';
  mcpBioTools.executeBioTool('genos_evolution_assimilate_plasmid', { agent_id: 'griot_1', plasmid_id: 'plasmid_x', source_agent: 'griot_2' });
  assert.strictEqual(executedCommand.includes('assimilate-plasmid --agent-id griot_1 --plasmid-id "plasmid_x" --source griot_2'), true);
  console.log('Plasmid assimilation test passed.');
}

runSpeciationTest();
runPlasmidTest();
