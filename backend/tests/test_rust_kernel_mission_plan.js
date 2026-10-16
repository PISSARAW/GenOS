'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openDatabase } = require('./helpers/biologyDatabase');
const service = require('../src/services/rustKernelMissionPlanService');

async function main() {
  const db = openDatabase();
  try {
    await db.exec(`CREATE TABLE missions (mission_id TEXT PRIMARY KEY);
      INSERT INTO missions VALUES ('mission-kernel');
      INSERT INTO missions VALUES ('mission-kernel-2');`);
    const objective = 'mission Node réelle';
    const plan = { decision_no_change: false, spawns: ['verifier'], reason: 'preuves manquantes' };
    const planJson = JSON.stringify(plan);
    const envelope = {
      schema: service.SCHEMA,
      missionId: 'mission-kernel',
      objectiveHash: sha256(objective),
      planHash: sha256(planJson),
      planJson,
      plan
    };
    const stored = await service.persist(db, {
      missionId: 'mission-kernel', objective, envelope
    });
    assert.equal(stored.plan_hash, envelope.planHash);
    const second = await service.persist(db, {
      missionId: 'mission-kernel-2', objective,
      envelope: { ...envelope, missionId: 'mission-kernel-2' }
    });
    assert.equal(second.plan_hash, envelope.planHash);
    await assert.rejects(db.run(`UPDATE rust_kernel_mission_plans
      SET plan_hash = 'tampered' WHERE mission_id = 'mission-kernel'`), /immutable/);
    await assert.rejects(service.persist(db, {
      missionId: 'mission-kernel', objective,
      envelope: { ...envelope, planHash: 'tampered' }
    }), { code: 'RUST_KERNEL_PLAN_HASH_MISMATCH' });
  } finally {
    await db.close();
  }
  console.log('Rust kernel mission plan binding: ok');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
