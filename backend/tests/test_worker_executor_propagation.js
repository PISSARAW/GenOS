'use strict';

const assert = require('node:assert/strict');

const dispatchService = require('../src/services/orchestratorDispatchService');
const contracts = require('../src/services/strategyContractService');
const originalDispatch = dispatchService.dispatchWorkerMission;
const originalContract = contracts.getLatestContract;
let dispatched;

async function main() {
  try {
    dispatchService.dispatchWorkerMission = async (request) => { dispatched = request; };
    contracts.getLatestContract = async () => ({ contract: { version: 1 } });
    delete require.cache[require.resolve('../bin/orchestratorActions.cjs')];
    const { startWorkerMission } = require('../bin/orchestratorActions.cjs');
    await startWorkerMission({
      db: {},
      context: {
        id: 'worker-executor-test',
        missionId: 'mission-executor-test',
        orchestratorId: 'orchestrator-executor-test',
        task: 'Verify executor propagation',
        request: { executor: 'codex', execution_budget: { tokens: 8000 } }
      },
      parent: { agent_type: 'GenOS', model_tier: 'frontier', isolation_mode: 'Branch' },
      reusable: null,
      worker: { name: 'Executor witness', role: 'verifier', workspaceRoot: process.cwd() }
    });
    assert.equal(dispatched.executor, 'codex');
    assert.equal(dispatched.agentId, 'worker-executor-test');
  } finally {
    dispatchService.dispatchWorkerMission = originalDispatch;
    contracts.getLatestContract = originalContract;
    delete require.cache[require.resolve('../bin/orchestratorActions.cjs')];
  }
}

main().then(() => console.log('Worker executor propagation: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
