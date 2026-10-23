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
  console.log('Windows local execution recovery identity: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
