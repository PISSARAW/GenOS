const assert = require('assert');
const test = require('node:test');
const genosCli = require('../src/services/genosCli');
const mcpBioTools = require('../src/services/mcpBioTools');

test('Swarm MCP biomimicry tools', async (t) => {
  let executedCommand = '';
  const originalRunGenosSync = genosCli.runGenosSync;
  genosCli.runGenosSync = (cmd) => {
    executedCommand = cmd;
    return Buffer.from(JSON.stringify({ success: true }));
  };

  try {
    await t.test('genos_biomimicry_network_quorum invokes CLI subcommand', async () => {
      executedCommand = '';
      const res = await mcpBioTools.executeBioTool('genos_biomimicry_network_quorum', {
        agent_id: 'griot_1',
        quorum_threshold: 5,
        action_id: 'refactor_auth'
      });
      assert.strictEqual(res.success, true);
      assert.ok(executedCommand.includes('network-quorum --agent-id griot_1 --threshold 5 --action-id "refactor_auth"'));
    });

    await t.test('genos_biomimicry_swarm_consensus invokes honeybee quorum protocol', async () => {
      executedCommand = '';
      const res = await mcpBioTools.executeBioTool('genos_biomimicry_swarm_consensus', {
        agent_id: 'griot_1',
        quorum_threshold: 0.66,
        action_id: 'dance_protocol'
      });
      assert.strictEqual(res.success, true);
      assert.ok(executedCommand.includes('network-quorum --agent-id griot_1 --threshold 0.66 --action-id "dance_protocol"'));
    });

    await t.test('genos_biomimicry_flocking_explore invokes flocking exploration', async () => {
      executedCommand = '';
      const res = await mcpBioTools.executeBioTool('genos_biomimicry_flocking_explore', {
        agent_id: 'griot_1',
        target_zone: 'api_layer',
        alignment_strength: 0.9
      });
      assert.strictEqual(res.success, true);
      assert.ok(executedCommand.includes('flocking-explore --agent-id griot_1 --zone "api_layer" --alignment 0.9'));
    });
  } finally {
    genosCli.runGenosSync = originalRunGenosSync;
  }
});
