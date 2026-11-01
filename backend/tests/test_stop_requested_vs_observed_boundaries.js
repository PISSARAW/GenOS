'use strict';

const assert = require('node:assert/strict');
const { runtimeExitOutcome } = require('../src/services/agentProcessOutcome');
const { startWorkerDeadline } = require('../src/services/agents/workerRuntimeBudgetService');
const { terminateChild } = require('../src/services/processTermination');

async function main() {
  // 1. Distinguer arrêt demandé et arrêt constaté dans runtimeExitOutcome
  const haltedResult = runtimeExitOutcome(
    { kind: 'worker_deadline', reason: 'contract deadline reached' },
    null,
    'SIGTERM',
    'worker timeout'
  );
  assert.equal(haltedResult.eventType, 'AGENT_HALTED');
  assert.equal(haltedResult.status, 'blocked');
  assert.equal(haltedResult.payload.stopRequested, true, 'halted result must flag stopRequested: true');
  assert.equal(haltedResult.payload.stopObserved, true, 'halted result must flag stopObserved: true');
  assert.equal(haltedResult.payload.terminationKind, 'worker_deadline');

  // 2. Sortie normale sans demande d'arrêt
  const normalResult = runtimeExitOutcome(null, 0, null, '');
  assert.equal(normalResult.payload.stopRequested, false, 'normal exit must have stopRequested: false');
  assert.equal(normalResult.payload.stopObserved, true, 'normal exit must have stopObserved: true');

  // 3. Crash sans demande d'arrêt
  const crashResult = runtimeExitOutcome(null, 1, null, 'panic: uncaught exception');
  assert.equal(crashResult.eventType, 'AGENT_FAILED');
  assert.equal(crashResult.payload.stopRequested, false, 'crash exit must have stopRequested: false');
  assert.equal(crashResult.payload.stopObserved, true, 'crash exit must have stopObserved: true');

  // 4. Déclenchement de startWorkerDeadline
  let haltedKind = null;
  let haltedReason = null;
  const mockChild = {
    pid: process.pid,
    exitCode: null,
    signalCode: null,
    killed: false,
    once: () => {},
  };
  const mockContext = {
    normalizedMission: { timeoutMs: 50 },
    child: mockChild,
    haltRuntime: (_ctx, kind, reason) => {
      haltedKind = kind;
      haltedReason = reason;
    }
  };

  startWorkerDeadline(mockContext);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(haltedKind, 'worker_deadline', 'startWorkerDeadline must trigger haltRuntime with worker_deadline');
  assert.equal(haltedReason, 'worker_execution_deadline_exceeded');

  // 5. Marquage explicite de la demande d'arrêt sur le processus
  const testChild = { pid: 999998, exitCode: null, signalCode: null, kill: () => {} };
  terminateChild(testChild);
  assert.equal(testChild.genosTerminationRequested, true, 'terminateChild must flag genosTerminationRequested: true');
  assert.ok(testChild.genosTerminationRequestedAt, 'terminateChild must set genosTerminationRequestedAt');

  console.log('Stop requested vs observed boundary checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
