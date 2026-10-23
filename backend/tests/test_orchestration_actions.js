const assert = require('assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const executor = require('../src/services/orchestrationActionExecutor');
const mcp = require('../src/services/mcpExecutor');
const authority = require('../src/services/missionEnvelopeAuthority');
const recovery = require('../src/services/agentRecoveryService');
const root = '/tmp/genos-capsule';
assert.equal(executor.actionArguments({ tool: 'genos_replay' }, { payload: {} }, root), null);
assert.equal(executor.actionArguments({ tool: 'genos_replay' }, { payload: { branchId: 'branch-1' } }, root), null);
assert.equal(executor.actionArguments({ tool: 'genos_replay' }, { payload: { snapshot: 'snapshot-1' } }, root), null);
const replayFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-replay-'));
const capsulesRoot = path.join(replayFixture, 'capsules');
const workerRoot = path.join(capsulesRoot, 'worker-1');
const snapshotPath = path.join(capsulesRoot, '.genos-runtime', 'trinity', 'snapshot.json');
fs.mkdirSync(workerRoot, { recursive: true });
fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
fs.writeFileSync(snapshotPath, '{}');
assert.deepEqual(executor.actionArguments({ tool: 'genos_replay' }, { payload: { snapshot: snapshotPath } }, workerRoot), {
  root: workerRoot, snapshot: snapshotPath
});
assert.equal(executor.actionArguments({ tool: 'genos_replay' }, { payload: { snapshot: path.join(replayFixture, 'outside.json') } }, workerRoot), null);
fs.rmSync(replayFixture, { recursive: true, force: true });
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
    authority.assertTool = async () => ({ status: 'authorized', envelope: {
      runId: 'run-authorized', scope: { organizationId: 'org-authorized', projectId: 'project-authorized' }
    } });
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
    let lastExecutionRequest;
    mcp.execute = async (request) => {
      lastExecutionRequest = request;
      order.push('tool');
      return { success: false, status: 'failed', error: 'replay unavailable' };
    };
    const failed = await executor.runAction(context, args);
    assert.equal(failed.executed, false);
    assert.deepEqual({ runId: lastExecutionRequest.runId,
      organizationId: lastExecutionRequest.organizationId,
      projectId: lastExecutionRequest.projectId }, {
      runId: 'run-authorized', organizationId: 'org-authorized', projectId: 'project-authorized'
    });
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
