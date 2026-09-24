'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const { optimizeTeam } = require('../src/services/aTeam/teamFormation/teamFormationOptimizer');
const learning = require('../src/services/aTeam/learning/teamLearningService');
const { persistSuccessfulLearning } = require('../src/services/aTeamComparativeBarrier');
const { activateATeamRun } = require('../src/services/agentRuntimeAdapter/missionWorkers');

async function withStore(runTest) {
  const originals = { save: sessions.save, load: sessions.load, remove: sessions.remove };
  const records = new Map();
  sessions.save = async (_db, record) => saveRecord(records, record);
  sessions.load = async (_db, id) => records.get(id) || null;
  sessions.remove = async (_db, id) => records.delete(id);
  const db = {
    run: async () => ({ changes: 1 }),
    all: async (query) => query.includes('PRAGMA table_info')
      ? [{ name: 'revision' }]
      : [...records.values()].map((row) => ({ state_json: JSON.stringify(row.state) }))
  };
  try { await runTest(db); } finally { Object.assign(sessions, originals); }
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

async function createCompletedRun(db) {
  const created = await runtime.createRun({
    db, missionId: 'learning-mission', idempotencyKey: 'learning-key', goal: 'Deliver API',
    organization: 'project_dag', status: 'RUNNING', phase: 'EXECUTION',
    members: [{ memberId: 'worker-a', agentId: 'worker-a', status: 'ACTIVE', capabilities: ['api'] }]
  });
  return runtime.transitionRun({ db, teamRunId: created.run.teamRunId, revision: created.run.revision, patch: { status: 'COMPLETED' } });
}

async function testAutonomousLifecycle(db) {
  const created = await runtime.createRun({
    db, missionId: 'autonomous-learning', idempotencyKey: 'auto-run', goal: 'Build API',
    status: 'READY', phase: 'PREBRIEF', members: [
      { memberId: 'api-member', label: 'api', role: 'backend', status: 'PLANNED', capabilities: ['api'] }
    ]
  });
  const plan = { aTeam: { teamRun: created.run, primaryDomain: 'api' } };
  const active = await activateATeamRun({ db, autonomyPlan: plan }, [{ agentId: 'worker-api', label: 'api', role: 'backend' }]);
  assert.equal(active.status, 'RUNNING');
  assert.equal(active.phase, 'EXECUTION');
  assert.equal(active.members[0].agentId, 'worker-api');
  const report = { outcome: 'success', artifacts: ['artifact://api-v1'], tests: [{ passed: true, evidence: ['artifact://api-v1'] }] };
  await persistSuccessfulLearning({ db, agentId: 'autonomous-learning', aTeam: plan.aTeam, dossiers: [{ workerId: 'worker-api', events: [{ evidenceReport: report }] }] });
  const completed = await require('../src/services/aTeam/teamRunStore').load(db, created.run.teamRunId);
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.execution.debriefId);
  const profile = await learning.learningProfile({ db, taskProfile: 'api' });
  assert.equal(profile.candidatePriors['worker-api'].successRate, 1);
}

async function testPersistedLearning(db) {
  const run = await createCompletedRun(db);
  let validations = 0;
  const input = {
    db, teamRunId: run.teamRunId, taskProfile: 'api delivery', objectiveMet: true,
    evidenceIds: ['ev-run'], metrics: { completionRate: 1, reworkRate: 0.1, handoffAcceptanceRate: 1, budgetEfficiency: 0.8 },
    lessons: [{ statement: 'Staff a verified API specialist', category: 'staffing', reusable: true, evidenceId: 'ev-run' }],
    memberOutcomes: { 'worker-a': { successRate: 0.9, evidenceId: 'ev-run' } },
    evidenceIsUsable: async () => { validations += 1; return true; }
  };
  const debrief = await learning.persistTeamDebrief(input);
  assert.equal(debrief.lessons[0].reusable, true);
  assert.equal(debrief.taskProfile, 'api delivery');
  assert.equal((await learning.persistTeamDebrief(input)).debriefId, debrief.debriefId);
  assert.equal(validations, 1);
  const profile = await learning.learningProfile({ db, taskProfile: 'api delivery' });
  assert.equal(profile.performance.successRate, 1);
  assert.equal(profile.staffingSignals[0].occurrences, 1);
  assert.equal(profile.candidatePriors['worker-a'].successRate, 0.9);
  return profile.candidatePriors;
}

function testPriorsAffectFormation(priors) {
  const result = optimizeTeam({
    requirements: [{ capability: 'api', weight: 1 }], capacity: 1,
    candidates: [
      { agentId: 'worker-a', capabilities: ['api'], reliability: 0.8 },
      { agentId: 'worker-b', capabilities: ['api'], reliability: 0.8 }
    ], performancePriors: { ...priors, 'worker-b': { sampleCount: 3, successRate: 0.1 } }
  });
  assert.equal(result.selected[0].candidate.agentId, 'worker-a');
}

async function run() {
  await withStore(async (db) => {
    testPriorsAffectFormation(await testPersistedLearning(db));
    await testAutonomousLifecycle(db);
  });
  console.log('A-Team debriefs persist, require sourced reusable lessons and inform future staffing.');
}

run().catch((error) => { console.error(error); process.exit(1); });
