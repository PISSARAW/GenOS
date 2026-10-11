'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const runtime = require('../src/services/aTeam/multiteam/programRuntimeService');

async function run() {
  const originalSave = sessions.save;
  const originalLoad = sessions.load;
  const records = new Map();
  sessions.save = async (_db, record) => saveRecord(records, record);
  sessions.load = async (_db, id) => records.get(id) || null;
  try {
    await runtime.createProgramRun({
      db: {}, programId: 'program-1', parentTeamRunId: 'parent-1',
      teams: [{ teamId: 'api', objective: 'Build API' }, { teamId: 'web', objective: 'Build UI' }],
      contracts: [{ contractId: 'api-ui', fromTeamId: 'api', toTeamId: 'web', provides: ['schema'], acceptanceCriteria: ['schema accepted'] }]
    });
    const calls = [];
    await assert.rejects(runtime.advanceProgramRun({ db: {}, programId: 'program-1', executeTeam: async (task) => {
      calls.push(task.teamId);
      if (task.teamId === 'api') return { status: 'SUCCEEDED', childRunId: 'child-api', evidenceRefs: ['evidence://api'] };
      return { status: 'SUCCEEDED', childRunId: 'child-web', verifiedContractIds: ['api-ui'], evidenceRefs: ['evidence://schema'] };
    } }), { code: 'ATEAM_MTS_SUBRUN_PROOF_REQUIRED' });
    assert.deepEqual(calls, ['api']);
    assert.equal(records.get('program-1').revision, 0);

    await runtime.createProgramRun({
      db: {}, programId: 'program-2',
      teams: [{ teamId: 'producer' }, { teamId: 'consumer' }],
      contracts: [{ contractId: 'handoff', fromTeamId: 'producer', toTeamId: 'consumer', provides: ['artifact'], acceptanceCriteria: ['checked'] }]
    });
    const blockedCalls = [];
    const waiting = await runtime.advanceProgramRun({ db: {}, programId: 'program-2', executeTeam: async (task) => {
      blockedCalls.push(task.teamId);
      return { status: task.teamId === 'producer' ? 'WAITING' : 'SUCCEEDED' };
    } });
    assert.deepEqual(blockedCalls, ['producer']);
    assert.equal(waiting.teams[1].status, 'PENDING');
    const retried = await runtime.advanceProgramRun({ db: {}, programId: 'program-2', executeTeam: async (task) => {
      assert.equal(task.existingChildRunId, null);
      return { status: 'WAITING', childRunId: 'child-producer' };
    } });
    assert.equal(retried.teams[0].receipt.childRunId, 'child-producer');
    await assert.rejects(runtime.advanceProgramRun({ db: {}, programId: 'program-2',
      executeTeam: async (task) => {
        assert.equal(task.existingChildRunId, 'child-producer');
        return { status: 'WAITING', childRunId: 'different-child' };
      } }), { code: 'ATEAM_MTS_CHILD_IDENTITY_CONFLICT' });
    await assert.rejects(runtime.advanceProgramRun({ db: {}, programId: 'missing', executeTeam: async () => ({ status: 'SUCCEEDED' }) }), { code: 'ATEAM_MTS_PROGRAM_UNKNOWN' });
  } finally {
    sessions.save = originalSave;
    sessions.load = originalLoad;
  }
  console.log('A-Team multiteam runtime refuses unverified success and blocks consumers.');
}

async function saveRecord(records, record) {
  const current = records.get(record.id);
  if (record.revision === undefined) {
    if (current) throw Object.assign(new Error('duplicate'), { code: 'TOPOLOGY_SESSION_CONFLICT' });
    records.set(record.id, { id: record.id, topology: record.topology, revision: 0, state: record.state });
    return { id: record.id, revision: 0 };
  }
  if (!current || current.revision !== record.revision) throw Object.assign(new Error('revision'), { code: 'TOPOLOGY_SESSION_CONFLICT' });
  const revision = current.revision + 1;
  records.set(record.id, { id: record.id, topology: record.topology, revision, state: record.state });
  return { id: record.id, revision };
}

run().catch((error) => { console.error(error); process.exit(1); });
