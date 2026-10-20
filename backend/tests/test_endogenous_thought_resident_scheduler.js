'use strict';

const assert = require('node:assert/strict');
const loop = require('../src/services/endogenousThoughtLoopService');
const resident = require('../src/services/endogenousThoughtResidentSchedulerService');
const idleTick = require('../src/services/idleTickService');

const sandbox = Object.freeze({ kind: 'isolated-read-only', readOnly: true,
  networkAllowed: false, mutationAllowed: false, externalActionAllowed: false,
  execute: async () => ({}), recover: async () => ({ status: 'completed', result: {} }) });

function injected() {
  return { enabled: true, maxCycles: 3,
    candidateProvider: async () => ({ organizationId: 'org-a', projectId: 'project-a',
      episodeId: 'episode-a', cumulativeUsage: { tokens: 7, usd: 0.2, seconds: 1 } }),
    authorize: async () => ({ signature: 'signed' }), verify: async () => ({}),
    worker: { id: 'worker-a' }, sandbox,
    usageMeter: { snapshot: async () => ({ tokens: 0, usd: 0, seconds: 0 }) } };
}

async function testUnavailableByDefault() {
  assert.deepEqual(resident.readiness(), {
    status: 'unavailable', reason: 'disabled', missing: []
  });
  const missing = resident.readiness({ enabled: true });
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.reason, 'production-dependencies-missing');
  assert.deepEqual(missing.missing, [
    'candidateProvider', 'authorize', 'verify', 'worker', 'sandbox', 'usageMeter'
  ]);
}

async function testInjectedBranch() {
  const original = loop.runAutonomousLoop;
  let observed;
  loop.runAutonomousLoop = async (db, input) => {
    observed = { db, input };
    return { status: 'stopped', episode: { episodeId: input.episodeId },
      cumulativeUsage: { tokens: 29, usd: 0.4, seconds: 3 } };
  };
  try {
    const db = { marker: 'production-db' };
    const result = await resident.runScheduled(db, injected());
    assert.equal(observed.db, db);
    assert.equal(observed.input.maxCycles, 3);
    assert.equal(observed.input.grantedBy, 'ett-resident-scheduler');
    assert.equal(observed.input.cumulativeUsage, undefined,
      'resident execution must reconstruct usage from persisted run receipts');
    assert.deepEqual(result.cumulativeUsage, { tokens: 29, usd: 0.4, seconds: 3 });
    assert.equal(result.usageSource, 'validated-run-receipts');
  } finally { loop.runAutonomousLoop = original; }
}

async function waitForCycle(scheduler) {
  const deadline = Date.now() + 1000;
  while (scheduler.state.cycles === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function testProductionSchedulerIsExplicitlyUnavailable() {
  const names = ['GENOS_IDLE_TICK_INTERVAL_MS', 'GENOS_IDLE_TICK_MIN_MS',
    'GENOS_IDLE_TICK_MAX_MS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  names.forEach((name) => { process.env[name] = '1'; });
  const db = { all: async () => [] };
  const scheduler = idleTick.startScheduler(async () => db, {});
  try {
    await waitForCycle(scheduler);
    assert.ok(scheduler.state.cycles > 0);
    assert.deepEqual(scheduler.state.lastOutcome.endogenousThought,
      { status: 'unavailable', reason: 'disabled', missing: [] });
  } finally {
    scheduler.stop();
    names.forEach((name) => {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    });
  }
}

async function main() {
  await testUnavailableByDefault();
  await testInjectedBranch();
  await testProductionSchedulerIsExplicitlyUnavailable();
  console.log('ETT resident scheduler fail-closed checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
