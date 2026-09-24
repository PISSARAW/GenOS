'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');

const members = [
  { memberId: 'api', workerId: 'worker-api', subSystem: 'api', role: 'engineer', dependsOn: [], capabilities: ['api'], outputs: ['api-contract'] },
  { memberId: 'web', workerId: 'worker-web', subSystem: 'web', role: 'engineer', dependsOn: ['api'], capabilities: ['web'], outputs: ['site'] }
];

async function run() {
  const originalSave = sessions.save;
  const originalLoad = sessions.load;
  const originalRemove = sessions.remove;
  const records = new Map();
  sessions.save = async (_db, record) => {
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
  };
  sessions.load = async (_db, id) => records.get(id) || null;
  sessions.remove = async (_db, id) => records.delete(id);
  try {
    const input = { db: {}, missionId: 'mission-runtime', idempotencyKey: 'request-1', goal: 'Build a site', status: 'READY', phase: 'PREBRIEF', members };
    const created = await runtime.createRun(input);
    assert.equal(created.created, true);
    assert.equal(created.graph.teamRunId, created.run.teamRunId);
    assert.equal(created.run.members.find((member) => member.memberId === 'web').pipelineStage, 1);
    assert.deepEqual(created.run.members.find((member) => member.memberId === 'web').capabilities, ['web']);
    const retry = await runtime.createRun(input);
    assert.equal(retry.created, false);
    assert.equal(retry.run.teamRunId, created.run.teamRunId);
    const running = await runtime.transitionRun({ db: {}, teamRunId: created.run.teamRunId, revision: created.run.revision, patch: { status: 'RUNNING', phase: 'EXECUTION' } });
    assert.equal(running.revision, created.run.revision + 1);
    const claim = await runtime.claimExecution({ db: {}, teamRunId: running.teamRunId, ownerId: 'dispatcher' });
    assert.equal(claim.claimed, true);
    assert.equal((await runtime.claimExecution({ db: {}, teamRunId: running.teamRunId })).claimed, false);
    assert.equal(await runtime.releaseExecution({ db: {}, teamRunId: running.teamRunId, token: 'wrong-token' }), false);
    assert.equal(await runtime.releaseExecution({ db: {}, teamRunId: running.teamRunId, token: claim.token }), true);
    await assert.rejects(runtime.transitionRun({ db: {}, teamRunId: running.teamRunId, revision: created.run.revision, patch: { status: 'COMPLETED' } }), { code: 'ATEAM_RUN_CONFLICT' });
    const latest = await require('../src/services/aTeam/teamRunStore').load({}, running.teamRunId);
    await assert.rejects(runtime.transitionRun({ db: {}, teamRunId: running.teamRunId, revision: latest.revision, patch: { status: 'FORMING' } }), { code: 'ATEAM_RUN_TRANSITION_INVALID' });
    await assert.rejects(runtime.createRun({ ...input, goal: 'Different mission' }), { code: 'ATEAM_RUN_IDEMPOTENCY_CONFLICT' });
  } finally {
    sessions.save = originalSave;
    sessions.load = originalLoad;
    sessions.remove = originalRemove;
  }
  console.log('A-Team runtime creates canonical idempotent runs and guards versioned transitions.');
}

run().catch((error) => { console.error(error); process.exit(1); });
