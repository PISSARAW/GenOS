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

function runSenescenceTest() {
  executedCommand = '';
  mcpBioTools.executeBioTool('genos_biomimicry_senescence_assess', { agent_id: 'griot_1', context_age: 150000 });
  assert.strictEqual(executedCommand.includes('senescence-assess --agent-id griot_1 --context-age 150000'), true);
  console.log('Senescence test passed.');
}

runSenescenceTest();
