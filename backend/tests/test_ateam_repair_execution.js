'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const { executeRepair } = require('../src/services/aTeam/adaptation/repairExecutionService');

async function withStore(runTest) {
  const originals = { save: sessions.save, load: sessions.load, remove: sessions.remove };
  const records = new Map();
  sessions.save = async (_db, record) => saveRecord(records, record);
  sessions.load = async (_db, id) => records.get(id) || null;
  sessions.remove = async (_db, id) => records.delete(id);
  try { await runTest(); } finally { Object.assign(sessions, originals); }
}

function saveRecord(records, record) {
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

async function createRunningRun() {
  const created = await runtime.createRun({
    db: {}, missionId: 'repair-mission', idempotencyKey: 'repair-key', goal: 'Repair team',
    status: 'RUNNING', phase: 'EXECUTION', members: [
      { memberId: 'api', agentId: 'worker-api', status: 'ACTIVE', capabilities: ['api'], ownedResponsibilities: ['api'] }
    ]
  });
  return created.run;
}

async function run() {
  await withStore(async () => {
    const runRecord = await createRunningRun();
    let dispatched = 0;
    const input = {
      db: {}, teamRunId: runRecord.teamRunId, repairId: 'repair-1', budget: 3, availableSlots: 1,
      repairPlan: { status: 'RECRUIT', capability: 'security', candidate: { agentId: 'candidate', capabilities: ['security'], estimatedCost: 2 }, estimatedCost: 2 },
      reserveCandidate: async () => ({ accepted: true, token: 'reservation' }),
      launchWorker: async () => { dispatched += 1; return { workerId: 'worker-security', status: 'ACTIVE' }; }
    };
    const result = await executeRepair(input);
    assert.equal(result.receipt.status, 'COMPLETED');
    assert.equal(result.run.status, 'RUNNING');
    assert.equal(result.run.members.find((member) => member.workerId === 'worker-security').status, 'ACTIVE');
    const replay = await executeRepair(input);
    assert.equal(replay.replayed, true);
    assert.equal(dispatched, 1);
  });
  await withStore(async () => {
    const runRecord = await createRunningRun();
    let released = false;
    const result = await executeRepair({
      db: {}, teamRunId: runRecord.teamRunId, repairId: 'repair-fail', budget: 2, availableSlots: 1,
      repairPlan: { status: 'REPLACE', failedMemberId: 'worker-api', replacement: { agentId: 'candidate', estimatedCost: 1 }, estimatedCost: 1 },
      reserveCandidate: async () => ({ accepted: true }), launchWorker: async () => ({ workerId: 'new-worker', status: 'FAILED' }),
      releaseCandidate: async () => { released = true; }
    });
    assert.equal(result.run.status, 'BLOCKED');
    assert.equal(result.receipt.status, 'BLOCKED');
    assert.equal(released, true);
    assert.equal(result.run.members[0].status, 'ACTIVE');
  });
  console.log('A-Team repair execution enforces dispatch adapters, budget, receipts and idempotent replay.');
}

run().catch((error) => { console.error(error); process.exit(1); });
