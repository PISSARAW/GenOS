'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const runStore = require('../src/services/aTeam/teamRunStore');
const graphStore = require('../src/services/aTeam/workGraph/workGraphStore');
const programs = require('../src/services/aTeam/multiteam/programRuntimeService');

function saveRecord(records, record) {
  const current = records.get(record.id);
  if (record.revision === undefined && current || record.revision !== undefined
    && (!current || current.revision !== record.revision)) {
    throw Object.assign(new Error('revision'), { code: 'TOPOLOGY_SESSION_CONFLICT' });
  }
  const revision = current ? current.revision + 1 : 0;
  records.set(record.id, { id: record.id, topology: record.topology,
    revision, state: JSON.parse(JSON.stringify(record.state)) });
  return { id: record.id, revision };
}

async function run() {
  const original = { save: sessions.save, load: sessions.load, remove: sessions.remove };
  const records = new Map();
  sessions.save = async (_db, record) => saveRecord(records, record);
  sessions.load = async (_db, id) => records.get(id) || null;
  sessions.remove = async (_db, id) => records.delete(id);
  const db = { get: async (_sql, id) => id === 'orchestrator' ? { id } : null };
  try {
    const parent = await runtime.createRun({ db, missionId: 'orchestrator', goal: 'Deliver program',
      members: [{ memberId: 'lead', role: 'lead', domain: 'coordination' }], status: 'READY',
      phase: 'PREBRIEF', execution: { runnerLease: null, organizationPolicy: { variant: 'multiteam' } } });
    await programs.createProgramRun({ db, programId: 'program-1', parentTeamRunId: parent.run.teamRunId,
      globalBudget: { tokens: 100 }, teams: [
        { teamId: 'api', variant: 'project_dag', objective: 'Build API', members: [
          { memberId: 'api-a', domain: 'api-a' }, { memberId: 'api-b', domain: 'api-b', dependsOn: ['api-a'] }
        ] },
        { teamId: 'web', variant: 'project_dag', objective: 'Build UI', members: [
          { memberId: 'web-a', domain: 'web-a' }, { memberId: 'web-b', domain: 'web-b' }
        ] }
      ] });
    const input = { db, programId: 'program-1', teamId: 'api', orchestratorId: 'orchestrator' };
    const child = await programs.createProgramSubrun(input);
    const persisted = await runStore.load(db, child.run.teamRunId);
    const graph = await graphStore.load(db, persisted.workGraphId);
    assert.equal(child.created, true);
    assert.equal(persisted.missionId, parent.run.missionId);
    assert.equal(persisted.execution.programBinding.parentTeamRunId, parent.run.teamRunId);
    assert.equal(persisted.execution.programBinding.authorizedBy, 'orchestrator');
    assert.equal(persisted.execution.programBinding.budget.tokens, 50);
    assert.equal(persisted.execution.organizationPolicy.variant, 'project_dag');
    assert.deepEqual(persisted.members.map((member) => member.memberId), ['api-a', 'api-b']);
    assert.ok(persisted.members.reduce((sum, member) => sum + member.executionBudgetTokens, 0) <= 50);
    assert.equal(graph.teamRunId, persisted.teamRunId);
    assert.equal((await programs.createProgramSubrun(input)).created, false);
    const launched = [];
    const progress = await programs.advanceProgramRun({ db, programId: 'program-1',
      orchestratorId: 'orchestrator', executeTeam: async (task) => {
        const linked = await runStore.load(db, task.childRunId);
        assert.equal(linked.execution.programBinding.teamId, task.teamId);
        launched.push(task.childRunId);
        return { status: 'WAITING', childRunId: task.childRunId };
      } });
    assert.equal(progress.status, 'RUNNING');
    assert.equal(launched.length, 2);
    assert.equal(progress.teams[0].receipt.childRunId, persisted.teamRunId);
    await assert.rejects(programs.advanceProgramRun({ db, programId: 'program-1',
      orchestratorId: 'orchestrator', executeTeam: async () => ({
        status: 'WAITING', childRunId: 'forged-child'
      }) }), { code: 'ATEAM_MTS_CHILD_IDENTITY_CONFLICT' });
    records.get('program-1').state.teams[0].budget.compute = 1;
    await assert.rejects(programs.createProgramSubrun(input),
      { code: 'ATEAM_MTS_SUBRUN_BINDING_CONFLICT' });
    await assert.rejects(programs.createProgramSubrun({ ...input, orchestratorId: 'other' }),
      { code: 'ATEAM_MTS_PARENT_AUTHORITY_REQUIRED' });
  } finally {
    sessions.save = original.save;
    sessions.load = original.load;
    sessions.remove = original.remove;
  }
  console.log('A-Team program creates durable, mission-bound subruns under parent authority.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
