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

function runSwarmTests() {
  executedCommand = '';
  mcpBioTools.executeBioTool('genos_biomimicry_network_quorum', { agent_id: 'griot_1', quorum_threshold: 5, action_id: 'refactor_auth' });
  assert.strictEqual(executedCommand.includes('network-quorum --agent-id griot_1 --threshold 5 --action-id "refactor_auth"'), true);
  
  executedCommand = '';
  mcpBioTools.executeBioTool('genos_biomimicry_flocking_explore', { agent_id: 'griot_1', target_zone: 'api_layer', alignment_strength: 0.9 });
  assert.strictEqual(executedCommand.includes('flocking-explore --agent-id griot_1 --zone "api_layer" --alignment 0.9'), true);

  console.log('Swarm ecology tests passed.');
}

runSwarmTests();
