'use strict';

const assert = require('node:assert/strict');
const { runWindowsLocalExecution } = require('../bin/orchestratorWindowsLocalExecution.cjs');

async function main() {
  const input = {
    db: { run: async () => ({ changes: 1 }) },
    id: 'mcp_orchestrator_persisted',
    missionId: 'mission-windows-local',
    task: { id: 'task-1' },
    enhancedPrompt: 'Solve the task for {{AGENT_ID}}.',
    request: { localModel: 'qwen2.5-coder:7b' },
    missionBudget: { tokens: 100, costUsd: 0.1, latencyMs: 1000 },
    requestTimeoutMs: 5000,
    allowedCommands: [],
    allowFileEdits: false,
    morphology: {},
    nceEnhancements: null,
    evaluateMissionContinuity: async () => ({}),
    gatherTelemetryAndCoverage: async () => ({}),
    finalizeOrchestratedMission: async () => {}
  };
  let observedMission = null;
  await runWindowsLocalExecution(input, {
    validScope: scope => scope,
    runLocalWorker: async (_db, mission) => {
      observedMission = mission;
      return { started: true, unresolved: false };
    }
  });
  assert.equal(observedMission.agentId, input.id);
  assert.equal(observedMission.orchestratorAgentId, input.id);
  assert.equal(observedMission.localModel, 'ollama://qwen2.5-coder:7b');
  const workerAssignments = Array.from({ length: 10 }, (_, index) => ({
    role: `worker-${index + 1}`, workerKind: 'bounded_worker', label: `worker-${index + 1}`
  }));
  const dispatched = [];
  const postflights = [];
  const multiInput = { ...input, autonomyPlan: { dispatchWorkers: workerAssignments,
    workerRoster: { exact: true, requestedWorkers: 10 } } };
  await runWindowsLocalExecution(multiInput, {
    validScope: scope => scope,
    createAutonomousWorkers: async () => workerAssignments.map((assignment, index) => ({
      agentId: `worker-${index + 1}`, role: assignment.role, prompt: `Work ${index + 1}`,
      executionBudget: { tokens: 10, costUsd: 0.01 }, workspaceRoot: `D:/worker-${index + 1}`
    })),
    runLocalWorker: async (_db, mission) => {
      dispatched.push(mission);
      return { started: true, unresolved: false };
    },
    runPostflight: async (context) => { postflights.push(context.workerAgentId); return {}; }
  });
  assert.equal(dispatched.length, 10);
  assert.deepEqual(dispatched.map(worker => worker.agentId), workerAssignments.map((_, index) => `worker-${index + 1}`));
  assert.ok(dispatched.every(worker => worker.orchestratorAgentId === input.id));
  assert.deepEqual(postflights, workerAssignments.map((_, index) => `worker-${index + 1}`));
  console.log('Windows local execution recovery identity: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
