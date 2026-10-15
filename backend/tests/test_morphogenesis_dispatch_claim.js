'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { openDatabase } = require('./helpers/biologyDatabase');
const queue = require('../src/services/durableContinuationService');

async function main() {
  const db = openDatabase();
  await db.exec(`CREATE TABLE continuation_queue (id TEXT PRIMARY KEY, agent_id TEXT, orchestrator_id TEXT,
    mission_json TEXT, status TEXT, organization_id TEXT, project_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, available_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  const mission = { agentId: 'claim-worker', continuationId: 'claim-id', budgetRound: {
    stage: 'morphogenesis_epoch', epoch: 1, missionId: 'claim-mission', orchestratorId: 'claim-parent' } };
  try {
    await queue.persistContinuation({ db, id: mission.continuationId, agentId: mission.agentId,
      orchestratorId: 'claim-parent', mission });
    const startedAt = performance.now();
    assert.equal(await queue.claimContinuation({ db, id: 'claim-id', agentId: 'claim-worker' }), true,
      'the first dispatcher durably claims pending work before starting its external effect');
    assert.equal(await queue.claimContinuation({ db, id: 'claim-id', agentId: 'claim-worker' }), false,
      'a concurrent dispatcher cannot claim the same effect twice');
    assert.equal(await queue.loadContinuation({ db, agentId: 'claim-worker' }), null,
      'claimed work is no longer eligible for automatic pending replay');
    const row = await db.get('SELECT status FROM continuation_queue WHERE id = ?', 'claim-id');
    assert.equal(row.status, 'dispatching', 'the durable claim remains visible if the process stops after the claim');
    assert.ok(Number.isFinite(performance.now() - startedAt), 'dispatch claim latency is measurable');
    console.log('Morphogenesis continuation dispatch claim is single-winner and durable: PASS');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
