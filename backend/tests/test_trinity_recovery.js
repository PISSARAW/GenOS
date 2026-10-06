'use strict';
const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const os = require('node:os');
const journal = require('../src/services/trinityExecutionJournal');
const dispatch = require('../src/services/trinityAdaptiveContinuationRunner');
const statistics = require('../src/services/trinitySequentialStatistics');
const runner = require('../src/services/trinitySequentialRunner');

async function main() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const input = { missionId: 'restart-test', mission: 'fixed', variantSelection: {} };
    let executions = 0;
    const execute = async (reports, phase) => {
      await phase('external_work', async () => { executions += 1; return { workerId: 'one-worker' }; });
      return { reports, status: 'executed' };
    };
    const first = await journal.resumeComparison({ db, input }, [{ worldNumber: 1 }], execute);
    const replay = await journal.resumeComparison({ db, input }, [{ worldNumber: 99 }], execute);
    assert.deepEqual(replay, first);
    assert.deepEqual(await journal.resumeComparison({ db, input: { variantSelection: {}, mission: 'fixed', missionId: 'restart-test' } }, [], execute), first);
    assert.equal(executions, 1);
    await db.run('UPDATE trinity_runtime_journal SET value_json = ? WHERE mission_id = ? AND stage = ?',
      JSON.stringify({ value: { status: 'invented' }, digest: 'wrong' }), input.missionId, 'comparison');
    await assert.rejects(journal.resumeComparison({ db, input }, [], execute), { code: 'TRINITY_JOURNAL_CORRUPT' });
    assert.equal(executions, 1);
    await assert.rejects(journal.resumeComparison({ db, input: { ...input, mission: 'changed' } }, [], execute), { code: 'TRINITY_REPLAY_CONFIGURATION_CHANGED' });
    const release = await journal.acquire(db, 'locked');
    await assert.rejects(journal.acquire(db, 'locked'), { code: 'TRINITY_EXECUTION_BUSY' });
    await release();
    const releaseAgain = await journal.acquire(db, 'locked');
    await releaseAgain();
    await db.run('INSERT INTO trinity_runtime_locks VALUES (?, ?, ?, ?)', 'dead-owner', 'dead', os.hostname(), 2147483647);
    const recover = await journal.acquire(db, 'dead-owner');
    await recover();
    const interrupted = { db, missionId: 'interrupted', configuration: { budget: 100 } };
    await assert.rejects(journal.phase(interrupted, 'dispatch', async () => { throw new Error('interruption'); }));
    assert.equal(await journal.read(db, 'interrupted', 'dispatch'), null);
    assert.equal((await journal.phase(interrupted, 'dispatch', async () => ({ actual: true }))).actual, true);
    assert.equal(dispatch.replicaId('mission', 'qd', 1), dispatch.replicaId('mission', 'qd', 1));
    assert.notEqual(dispatch.replicaId('mission', 'qd', 1), dispatch.replicaId('mission', 'qd', 2));
    assert.notEqual(dispatch.replicaId('mission', 'qd', 1), dispatch.replicaId('other', 'qd', 1));
    const existing = { get: async () => ({ id: 'created-before-crash' }) };
    assert.equal((await dispatch.dispatchOnce({ db: existing, payload: { workerId: 'created-before-crash' } })).resumed, true);
    assert.ok(statistics.expectedInformationGain({ alpha: 1, beta: 1 }) > statistics.expectedInformationGain({ alpha: 20, beta: 20 }));
    assert.ok(Math.abs(statistics.expectedInformationGain({ alpha: 1, beta: 1 }) - (1 - 0.5 / Math.LN2)) < 1e-6);
    assert.throws(() => runner.settings({ sequentialConfig: { replicaBudget: 2, tokensPerReplica: 100 } }));
    assert.equal(runner.settings({ sequentialConfig: { replicaBudget: 6, tokensPerReplica: 100 } }).totalBudget, 6);
    assert.throws(() => runner.settings({ sequentialConfig: { replicaBudget: 6, tokensPerReplica: 100, minReplicasPerArm: 0 } }));
    assert.throws(() => runner.settings({ sequentialConfig: { replicaBudget: 6, tokensPerReplica: 100 } }, 16));
    console.log('Trinity durable replay, exclusive ownership, interrupted stages and bounded sequential settings: PASS');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
