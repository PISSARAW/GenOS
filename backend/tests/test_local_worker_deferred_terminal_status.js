'use strict';

const assert = require('assert');

function installMock(request, exports) {
  const resolved = require.resolve(request);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

async function testCompletion() {
  const updates = [];
  const events = [];
  installMock('../src/services/agentOrchestrationState', {
    updateAgent: async (...args) => updates.push(args),
    emit: (...args) => { events.push(args); return { eventType: args[1] }; }
  });
  const completion = require('../src/services/workerEvidenceBarrierLocalCompletion');
  await completion.emit({
    mission: { agentId: 'orchestrator', deferAgentTerminalStatus: true },
    unresolved: false, statusText: 'review complete', executionRun: { id: 'run-1' },
    evidenceReport: {}, eventType: 'AGENT_COMPLETED', kind: 'LOCAL_CODE_PROPOSAL', detail: 'done'
  }, async () => {});
  assert.equal(updates.length, 0, 'worker success must not terminate the orchestrator before homeostasis');
  assert.equal(events.some((event) => event[1] === 'EVIDENCE_REPORT' && event[6] === 'running'), true);
  assert.equal(events.some((event) => event[1] === 'LOCAL_WORKER_COMPLETED' && event[6] === 'running'), true);
  const terminalPath = require.resolve('../src/services/agentTerminalStatusService');
  delete require.cache[terminalPath];
  const terminalStatus = require(terminalPath);
  assert.equal(terminalStatus.isTerminalEvent('LOCAL_WORKER_COMPLETED'), false);
  await assertOrchestratorRemainsRunning(terminalStatus, updates, 'LOCAL_WORKER_COMPLETED');
}

async function testFailure() {
  const updates = [];
  const events = [];
  installMock('../src/services/agentOrchestrationState', {
    updateAgent: async (...args) => updates.push(args),
    emit: (...args) => { events.push(args); return { eventType: args[1] }; }
  });
  installMock('../src/services/strategyExecutionService', { recordExecutionEvent: async () => ({}) });
  installMock('../src/services/agentRecoveryService', { queueWorkerRecovery: () => {} });
  installMock('../src/services/agentRoundService', { advanceAutonomousRound: async () => {} });
  installMock('../src/services/agentWorkspaceLifecycleService', { scheduleWorkspaceCleanup: async () => {} });
  installMock('../src/services/agentEvidenceService', { recordWorkerEvidence: () => {} });
  const failure = require('../src/services/workerEvidenceBarrierLocalFailure');
  await failure.publish({
    mission: { agentId: 'orchestrator', deferAgentTerminalStatus: true },
    error: new Error('model output unavailable'), executionRun: { id: 'run-2' },
    reportMilestone: () => {}
  });
  assert.equal(updates.length, 0, 'worker failure must leave terminalization to the orchestrator');
  assert.equal(events.some((event) => event[1] === 'LOCAL_WORKER_FAILED' && event[6] === 'running'), true);
  const terminalPath = require.resolve('../src/services/agentTerminalStatusService');
  delete require.cache[terminalPath];
  const terminalStatus = require(terminalPath);
  assert.equal(terminalStatus.isTerminalEvent('LOCAL_WORKER_FAILED'), false);
  await assertOrchestratorRemainsRunning(terminalStatus, updates, 'LOCAL_WORKER_FAILED');
}

async function assertOrchestratorRemainsRunning(terminalStatus, updates, eventType) {
  const state = { executionQueue: Promise.resolve(), pendingTerminalStatuses: new Map() };
  terminalStatus.queue({ agentId: 'orchestrator', state }, {
    eventType, status: 'running', trackedEventId: eventType, currentTask: 'homeostasis pending', payload: {}
  }, 'running');
  await state.executionQueue;
  assert.equal(state.pendingTerminalStatuses.size, 0, 'deferred result must not enter terminal settlement');
  assert.equal(updates.at(-1)[1], 'running', 'terminal service must leave orchestrator active');
}
async function testWindowsMissionDefersStatus() {
  const runner = require('../bin/orchestratorWindowsLocalExecution.cjs');
  const mission = runner.buildLocalMission({ id: 'orchestrator', missionId: 'mission', enhancedPrompt: 'review',
    request: {}, missionBudget: {}, requestTimeoutMs: 5000, allowedCommands: [], allowFileEdits: false,
    orchestratorAgentId: 'windows-orchestrator' });
  assert.equal(mission.deferAgentTerminalStatus, true);
}
async function main() {
  await testWindowsMissionDefersStatus();
  await testCompletion();
  await testFailure();
  console.log('local worker deferred terminal status: 3 scenarios passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });