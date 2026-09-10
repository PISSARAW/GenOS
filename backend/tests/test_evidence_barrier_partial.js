const assert = require('node:assert/strict');

function capturedEvents() {
  const telemetry = require('../src/services/telemetryObserver');
  const events = [];
  const original = telemetry.emitEvent;
  telemetry.emitEvent = (event) => {
    events.push(event);
    return event;
  };
  return { events: events, original: original };
}

function restoreTelemetry(capture) {
  const telemetry = require('../src/services/telemetryObserver');
  telemetry.emitEvent = capture.original;
}

function eventsOfType(events, eventType) {
  const found = [];
  for (const event of events) {
    if (event.eventType === eventType) found.push(event);
  }
  return found;
}

function makeWorkers() {
  return [
    { agentId: 'worker-a', label: 'worker-a', name: 'Worker A', role: 'reviewer' },
    { agentId: 'worker-b', label: 'worker-b', name: 'Worker B', role: 'reviewer' }
  ];
}

function makeBarrierInput(agentId, workers) {
  return {
    db: {},
    agentId: agentId,
    normalizedMission: { prompt: 'base mission', workerBarrierTimeoutMs: 50 },
    autonomyPlan: {},
    contractRecord: {},
    autonomousWorkers: workers
  };
}

function seedRound(agentId, workers, entries) {
  const state = require('../src/services/agentOrchestrationState');
  const participants = new Map();
  const events = new Map();
  for (const worker of workers) {
    participants.set(worker.agentId, { workerId: worker.agentId, role: worker.role });
  }
  for (const entry of entries) {
    events.set(entry.workerId, entry.events);
  }
  state.workerEvidenceRounds.set(agentId, {
    workerIds: new Set(workers.map((worker) => worker.agentId)),
    participants: participants,
    events: events
  });
}

function stubPipeline(behavior) {
  const pipeline = require('../src/services/workerEvidenceBarrierPipeline');
  const original = pipeline.executeWorkerPipeline;
  pipeline.executeWorkerPipeline = behavior;
  return original;
}

function restorePipeline(original) {
  const pipeline = require('../src/services/workerEvidenceBarrierPipeline');
  pipeline.executeWorkerPipeline = original;
}

function cleanupAgent(agentId) {
  const state = require('../src/services/agentOrchestrationState');
  state.activeWorkerBarriers.delete(agentId);
  state.workerEvidenceRounds.delete(agentId);
}

function usableEntry(workerId) {
  return { workerId: workerId, events: [{ evidenceReport: { claims: [{ statement: 'ok', evidence: ['proof'] }] } }] };
}

function failureEntry(workerId) {
  return { workerId: workerId, events: [{ failure: { category: 'runtime_failure', reason: 'boom' } }] };
}

async function testPartialIsTerminalOnly() {
  const agentId = 'orch-partial-terminal';
  const workers = makeWorkers();
  const capture = capturedEvents();
  const barrier = require('../src/services/workerEvidenceBarrier');
  const original = stubPipeline(async (ctx) => {
    void ctx;
    seedRound(agentId, workers, [usableEntry('worker-a'), usableEntry('worker-b')]);
    const error = new Error('Timed out waiting.');
    error.code = 'WORKER_BARRIER_TIMEOUT';
    throw error;
  });
  try {
    await barrier.runEvidenceBarrier(makeBarrierInput(agentId, workers));
  } finally {
    restorePipeline(original);
  }
  const partial = eventsOfType(capture.events, 'WORKER_EVIDENCE_BARRIER_PARTIAL');
  const satisfied = eventsOfType(capture.events, 'WORKER_EVIDENCE_BARRIER_SATISFIED');
  restoreTelemetry(capture);
  cleanupAgent(agentId);
  assert.equal(partial.length, 1);
  assert.equal(satisfied.length, 0);
  assert.equal(partial[0].payload.partial, true);
  assert.equal(partial[0].payload.workersCompleted, 2);
  assert.equal(partial[0].payload.workersTotal, 2);
  assert.match(String(partial[0].detail), /2\/2 workers terminal/);
}

async function testGhostWorkerDegrades() {
  const agentId = 'orch-ghost-degrade';
  const workers = makeWorkers();
  const capture = capturedEvents();
  const barrier = require('../src/services/workerEvidenceBarrier');
  const original = stubPipeline(async (ctx) => {
    void ctx;
    seedRound(agentId, workers, [usableEntry('worker-a')]);
    const error = new Error('Autonomous worker worker-b of orchestrator orch-ghost-degrade is missing.');
    error.code = 'WORKER_NOT_FOUND';
    throw error;
  });
  let thrown = null;
  try {
    await barrier.runEvidenceBarrier(makeBarrierInput(agentId, workers));
  } catch (error) {
    thrown = error;
  } finally {
    restorePipeline(original);
  }
  const partial = eventsOfType(capture.events, 'WORKER_EVIDENCE_BARRIER_PARTIAL');
  const halted = eventsOfType(capture.events, 'WORKER_EVIDENCE_BARRIER_HALTED');
  const failed = eventsOfType(capture.events, 'WORKER_EVIDENCE_BARRIER_FAILED');
  restoreTelemetry(capture);
  cleanupAgent(agentId);
  assert.equal(thrown, null);
  assert.equal(partial.length, 1);
  assert.equal(halted.length, 0);
  assert.equal(failed.length, 0);
}

async function testFailureOnlyIsNoEvidence() {
  const agentId = 'orch-failure-only';
  const workers = makeWorkers();
  const capture = capturedEvents();
  const barrier = require('../src/services/workerEvidenceBarrier');
  const original = stubPipeline(async (ctx) => {
    void ctx;
    seedRound(agentId, workers, [failureEntry('worker-a'), failureEntry('worker-b')]);
    const error = new Error('Timed out waiting.');
    error.code = 'WORKER_BARRIER_TIMEOUT';
    throw error;
  });
  let thrown = null;
  try {
    await barrier.runEvidenceBarrier(makeBarrierInput(agentId, workers));
  } catch (error) {
    thrown = error;
  } finally {
    restorePipeline(original);
  }
  restoreTelemetry(capture);
  cleanupAgent(agentId);
  assert.ok(thrown);
  assert.equal(thrown.code, 'WORKER_BARRIER_NO_EVIDENCE');
}

function checkStrictFilter() {
  const barrier = require('../src/services/workerEvidenceBarrier');
  const failureDossier = { workerId: 'w1', events: [{ failure: { category: 'x', reason: 'y' } }] };
  const evidenceDossier = { workerId: 'w2', events: [{ evidenceReport: { claims: [] } }] };
  assert.equal(barrier.isUsablePartialDossier(failureDossier), false);
  assert.equal(barrier.isUsablePartialDossier(evidenceDossier), true);
}

async function main() {
  checkStrictFilter();
  await testPartialIsTerminalOnly();
  await testGhostWorkerDegrades();
  await testFailureOnlyIsNoEvidence();
  console.log('Evidence barrier partial checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
