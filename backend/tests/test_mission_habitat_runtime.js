'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const habitats = require('../src/services/habitatRevisionService');
const runtime = require('../src/services/missionHabitatRuntime');

function configuration(overrides = {}) {
  return {
    runtimeKind: 'process', imageDigest: null,
    filesystemPolicy: { type: 'workspace_copy' },
    networkPolicy: { type: 'host', allowedHosts: [] },
    limits: { cpuSeconds: null, memoryMb: null, pidCount: null, diskMb: null,
      wallClockMs: 5000, outputBytes: null },
    secretBrokerPolicy: { type: 'unavailable' }, mountedResources: [],
    isolationAssertions: { filesystem: 'declared', network: 'unavailable', process: 'unavailable' },
    ...overrides
  };
}

function context(db, mission = {}) {
  return { db, dispatchedAgent: { workspace_id: null }, normalizedMission: {
    missionId: 'mission-runtime', executor: 'codex', timeoutMs: 9000,
    executionBudget: { latencyMs: 8000 }, habitatRef: { habitatId: 'process-host', revision: 1 },
    ...mission
  } };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error.code === code);
}

async function main() {
  const db = openDatabase();
  try {
    const revision = await habitats.registerRevision(db, {
      habitatId: 'process-host', configuration: configuration(), expectedRevision: 0
    });
    const ctx = context(db);
    const binding = await runtime.bindMissionHabitat(ctx);
    assert.equal(binding.habitatHash, revision.contentHash);
    assert.equal(ctx.normalizedMission.timeoutMs, 5000);
    assert.equal(ctx.normalizedMission.executionBudget.latencyMs, 5000);
    assert.deepEqual(await runtime.bindMissionHabitat(ctx), binding);

    await habitats.registerRevision(db, { habitatId: 'container-a', expectedRevision: 0,
      configuration: configuration({ runtimeKind: 'container', imageDigest: `sha256:${'a'.repeat(64)}` }) });
    await expectCode(runtime.bindMissionHabitat(context(db, { missionId: 'mission-container',
      habitatRef: { habitatId: 'container-a', revision: 1 } })), 'HABITAT_RUNTIME_MISMATCH');

    await habitats.registerRevision(db, { habitatId: 'unproven', expectedRevision: 0,
      configuration: configuration({ isolationAssertions: { process: 'enforced' } }) });
    await expectCode(runtime.bindMissionHabitat(context(db, { missionId: 'mission-unproven',
      habitatRef: { habitatId: 'unproven', revision: 1 } })), 'HABITAT_ASSURANCE_UNPROVEN');
  } finally {
    await db.close();
  }
}

main().then(() => console.log('mission habitat runtime tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
