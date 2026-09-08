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

function runPruningTest() {
  executedCommand = '';
  mcpBioTools.executeBioTool('genos_synaptic_prune_scale', { agent_id: 'griot_1', scale: 0.5 });
  assert.strictEqual(executedCommand.includes('synaptic prune-scale --agent-id griot_1 --scale 0.5'), true);
  console.log('Pruning test passed.');
}

runPruningTest();
