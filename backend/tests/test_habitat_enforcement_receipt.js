'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { openDatabase } = require('./helpers/biologyDatabase');
const habitats = require('../src/services/habitatRevisionService');
const missionRuntime = require('../src/services/missionHabitatRuntime');
const enforcement = require('../src/services/habitatEnforcementService');

function configuration(overrides = {}) {
  return { runtimeKind: 'process', imageDigest: null,
    filesystemPolicy: { type: 'workspace_copy' },
    networkPolicy: { type: 'host', allowedHosts: [] },
    limits: { cpuSeconds: null, memoryMb: null, pidCount: null, diskMb: null,
      wallClockMs: 30, outputBytes: null },
    secretBrokerPolicy: { type: 'unavailable' }, mountedResources: [],
    isolationAssertions: { filesystem: 'declared', network: 'unavailable' },
    ...overrides };
}

function bindingContext(db, mission = {}) {
  return { db, dispatchedAgent: { workspace_id: null }, normalizedMission: {
    missionId: 'mission-enforced', executor: 'codex',
    habitatRef: { habitatId: 'habitat-enforced', revision: 1 }, ...mission
  } };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error.code === code);
}

async function main() {
  const db = openDatabase();
  try {
    await habitats.registerRevision(db, { habitatId: 'habitat-enforced', expectedRevision: 0,
      configuration: configuration() });
    const bound = bindingContext(db);
    await missionRuntime.bindMissionHabitat(bound);
    const child = Object.assign(new EventEmitter(), { pid: 4242, exitCode: null, signalCode: null });
    const halts = [];
    const runtime = { ...bound, agentId: 'agent-enforced', executionRun: { id: 'run-enforced' },
      child, haltRuntime: (...args) => halts.push(args) };
    const receipt = await enforcement.armProcessWallClock(runtime);
    assert.equal(receipt.habitatHash, bound.habitatRevision.contentHash);
    assert.equal(receipt.bindingHash, bound.habitatBinding.bindingHash);
    assert.equal(receipt.processId, 4242);
    assert.equal(receipt.enforcer, enforcement.ENFORCER);
    const stored = await db.get('SELECT * FROM habitat_enforcement_receipts WHERE id = ?', receipt.id);
    assert.equal(stored.receipt_hash, receipt.receiptHash);
    await assert.rejects(db.run('UPDATE habitat_enforcement_receipts SET process_id = 8 WHERE id = ?', receipt.id),
      /Immutable habitat enforcement receipt/);
    await delay(60);
    assert.equal(halts.length, 1);
    assert.equal(halts[0][1], 'habitat_wall_clock');

    const forged = { ...bound.habitat.enforcementPlan };
    await expectCode(enforcement.armProcessWallClock({ ...runtime,
      executionRun: { id: 'run-forged' }, habitat: { ...bound.habitat, enforcementPlan: forged } }),
    'HABITAT_ENFORCEMENT_PLAN_UNTRUSTED');
    const persistenceHalts = [];
    const failingDb = { ...db, run: async (sql, ...params) => {
      if (sql.includes('INSERT INTO habitat_enforcement_receipts')) throw new Error('receipt store unavailable');
      return db.run(sql, ...params);
    } };
    await expectCode(enforcement.armProcessWallClock({ ...runtime, db: failingDb,
      executionRun: { id: 'run-persistence-failure' },
      haltRuntime: (...args) => persistenceHalts.push(args) }),
    'HABITAT_ENFORCEMENT_RECEIPT_FAILED');
    assert.equal(persistenceHalts[0][1], 'habitat_enforcement_failed');
    await expectCode(missionRuntime.bindMissionHabitat(bindingContext(db, {
      missionId: 'mission-forged', habitatEnforcementReceipt: { receiptHash: 'caller' }
    })), 'HABITAT_CALLER_PROOF_FORBIDDEN');
    assert.throws(() => enforcement.assertSupervisedProcess(bound, true),
      error => error.code === 'HABITAT_PROCESS_UNSUPERVISED');

    await habitats.registerRevision(db, { habitatId: 'external-habitat', expectedRevision: 0,
      configuration: configuration({ runtimeKind: 'external' }) });
    await expectCode(missionRuntime.bindMissionHabitat(bindingContext(db, {
      missionId: 'mission-external', executor: 'caller_mcp',
      habitatRef: { habitatId: 'external-habitat', revision: 1 }
    })), 'HABITAT_LIMIT_UNENFORCED');
  } finally {
    await db.close();
  }
}

main().then(() => console.log('habitat enforcement receipt tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
