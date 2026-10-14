const assert = require('assert');
const executor = require('../src/services/orchestrationActionExecutor');
const mcp = require('../src/services/mcpExecutor');
const authority = require('../src/services/missionEnvelopeAuthority');
const recovery = require('../src/services/agentRecoveryService');
const root = '/tmp/genos-capsule';
assert.equal(executor.actionArguments({ tool: 'genos_replay' }, { payload: {} }, root), null);
assert.equal(executor.actionArguments({ tool: 'genos_replay' }, { payload: { branchId: 'branch-1' } }, root), null);
assert.deepEqual(executor.actionArguments({ tool: 'genos_replay' }, { payload: { snapshot: 'snapshot-1' } }, root), { root, snapshot: 'snapshot-1' });
assert.equal(executor.actionArguments({ tool: 'genos_evaluate_trajectories' }, { payload: {} }, root), null);
const experience = executor.actionArguments({ tool: 'genos_record_experience' }, { detail: 'proposal', payload: { proposal: { changedFiles: ['src/a.rs'], tests: [{ command: 'cargo test --quiet', exitCode: 0 }], proposal: { evidence: 'passed' } } } }, root);
assert.equal(experience.successful, true);
assert.equal(executor.actionArguments({ tool: 'genos_parasitic_pressure' }, { payload: { input: '../outside.json', output: 'out.json' } }, root), null);

async function testOrganizationFollowsVerifiedAction() {
  const worldModel = require('../src/services/worldModelService');
  const causalLedger = require('../src/services/causalLedgerService');
  const swarm = require('../src/services/swarmTopologyRuntimeService');
  const original = {
    execute: mcp.execute, assertTool: authority.assertTool,
    applyOrganizationDecision: recovery.applyOrganizationDecision,
    observeTransition: worldModel.observeTransition, recordSample: worldModel.recordSample,
    link: causalLedger.link, applySteps: swarm.applyStepsForOrchestrator
  };
  const order = [];
  try {
    authority.assertTool = async () => {};
    worldModel.observeTransition = async () => ({ matched: true, surprise: 0 });
    worldModel.recordSample = async () => {};
    causalLedger.link = async () => {};
    swarm.applyStepsForOrchestrator = async () => {};
    recovery.applyOrganizationDecision = async () => {
      order.push('organization');
      return { changed: true, organization: 'hierarchical_merge' };
    };
    const context = {
      orchestratorId: 'orchestrator-test', sourceAgentId: 'worker-test', sourceEventId: 'event-test',
      decision: { tool: 'genos_replay', action: 'replay_before_promotion', organization: 'hierarchical_merge', reason: 'verify first' },
      event: { id: 'event-test', eventType: 'AGENT_COMPLETED', payload: {} }, db: {}
    };
    const args = { root: '/tmp/workspace', snapshot: 'snapshot-test' };
    mcp.execute = async () => {
      order.push('tool');
      return { success: false, status: 'failed', error: 'replay unavailable' };
    };
    const failed = await executor.runAction(context, args);
    assert.equal(failed.executed, false);
    assert.deepEqual(order, ['tool'], 'An unsuccessful action must not change organization.');

    order.length = 0;
    mcp.execute = async () => {
      order.push('tool');
      return { success: true, data: { success: true, replay_status: 'UNVERIFIED', execution_replayed: false } };
    };
    const unverified = await executor.runAction(context, args);
    assert.equal(unverified.executed, false);
    assert.deepEqual(order, ['tool'], 'Transport success without a verified replay receipt must not change organization.');

    order.length = 0;
    mcp.execute = async () => {
      order.push('tool');
      return { success: true, data: { success: true, replay_status: 'VERIFIED', execution_replayed: true } };
    };
    const verified = await executor.runAction(context, args);
    assert.equal(verified.executed, true);
    assert.deepEqual(order, ['tool', 'organization']);
    assert.equal(verified.result.organizationTransition.status, 'applied');
  } finally {
    mcp.execute = original.execute;
    authority.assertTool = original.assertTool;
    recovery.applyOrganizationDecision = original.applyOrganizationDecision;
    worldModel.observeTransition = original.observeTransition;
    worldModel.recordSample = original.recordSample;
    causalLedger.link = original.link;
    swarm.applyStepsForOrchestrator = original.applySteps;
  }
}

testOrganizationFollowsVerifiedAction().then(() => console.log('Orchestration action checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
