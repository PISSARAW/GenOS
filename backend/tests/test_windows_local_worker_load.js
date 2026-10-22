const assert = require('node:assert/strict');
const { machineLoad } = require('../src/services/agentModelRoutingService');
const { buildLocalMission } = require('../bin/orchestratorWindowsLocalExecution.cjs');

const first = machineLoad();
assert(first === null || (Number.isFinite(first) && first >= 0));
const patchContract = {
  requiredPatchPaths: ['src/delivery.js'],
  requiredPatchMarkers: { 'src/delivery.js': ['pendingAfterRestart'] },
  requiredPatchMinimumBytes: { 'src/delivery.js': 100 }
};
const localMission = buildLocalMission({
  id: 'windows-local-test', missionId: 'windows-local-test',
  enhancedPrompt: 'Repair the delivery helper.',
  request: { localCodeWorker: true, modelId: 'ollama://qwen2.5-coder:7b', ...patchContract },
  missionBudget: { tokens: 1000, costUsd: 0, latencyMs: 5000 },
  requestTimeoutMs: 6000, allowedCommands: ['node checks/verify.js'],
  allowFileEdits: true, orchestratorAgentId: 'test-orchestrator'
});
for (const [field, value] of Object.entries(patchContract)) {
  assert.deepEqual(localMission[field], value, `local Windows runner forwards ${field}`);
}
console.log('Local worker load measurement is safe on this platform.');
