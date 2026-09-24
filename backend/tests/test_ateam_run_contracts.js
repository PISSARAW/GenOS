const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const teamRuns = require('../src/services/aTeam/teamRunStore');
const { validateTeamRun } = require('../src/services/aTeam/contracts/teamRunContract');
const { validateWorkNode } = require('../src/services/aTeam/contracts/workNodeContract');
const { validateHandoff } = require('../src/services/aTeam/contracts/handoffContract');

const member = {
  memberId: 'member-front', agentId: 'agent-front', role: 'engineer', domain: 'frontend',
  expertise: ['react'], ownedResponsibilities: ['UI'], consumes: [], provides: ['ui.bundle'],
  consults: [], participationMode: 'FULL', authority: {
    owns: ['UI'], mayModify: [], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: []
  }, toolLease: ['read_file'], status: 'ACTIVE'
};
const run = {
  teamRunId: 'team-run-1', missionId: 'mission-1', goal: 'Build a product', successCriteria: ['works'],
  workGraphId: null, organization: 'specialist_expert_committee', members: [member],
  requiredCapabilities: [{ capability: 'react', weight: 1 }], capabilityGaps: [], status: 'FORMING',
  phase: 'ELIGIBILITY', createdAt: '2026-09-24T10:00:00.000Z'
};

assert.equal(validateTeamRun(run).valid, true);
assert.equal(validateTeamRun({ ...run, members: [member, member] }).valid, false);
assert.equal(validateWorkNode({
  nodeId: 'node-1', responsibility: 'Build UI', requiredCapabilities: ['react'], inputs: [], outputs: ['ui.bundle'],
  preconditions: [], postconditions: ['bundle exists'], ownerAgentId: 'agent-front', risk: 'low', criticality: 'medium', status: 'READY'
}).valid, true);
assert.equal(validateHandoff({
  handoffId: 'h-1', type: 'DELIVERY', producer: { agentId: 'a' }, consumer: { agentId: 'b' }, artifactRefs: [], claimRefs: [],
  evidenceRefs: ['build://1'], assumptions: [], preconditions: [], postconditions: [], invariants: [],
  knownRisks: [], openQuestions: [], acceptanceCriteria: [], version: 1, status: 'READY_FOR_REVIEW'
}).valid, true);

(async () => {
  const originalSave = sessions.save;
  const originalLoad = sessions.load;
  const records = new Map();
  sessions.save = async (_db, record) => {
    const revision = record.revision === undefined ? 0 : record.revision + 1;
    records.set(record.id, { id: record.id, topology: record.topology, revision, state: record.state });
    return { id: record.id, revision };
  };
  sessions.load = async (_db, id) => records.get(id) || null;
  try {
    const created = await teamRuns.create({}, { ...run, teamRunId: undefined, members: [{ ...member, memberId: undefined }] });
    assert.equal(created.revision, 0);
    assert.equal(created.members[0].domain, 'frontend');
    const loaded = await teamRuns.load({}, created.teamRunId);
    const updated = await teamRuns.update({ db: {}, teamRunId: loaded.teamRunId, revision: loaded.revision, patch: { phase: 'EXECUTION' } });
    assert.equal(updated.revision, 1);
    assert.equal(updated.phase, 'EXECUTION');
    await assert.rejects(
      teamRuns.update({ db: {}, teamRunId: loaded.teamRunId, revision: loaded.revision, patch: { phase: 'REPAIR' } }),
      { code: 'ATEAM_RUN_CONFLICT' }
    );
  } finally {
    sessions.save = originalSave;
    sessions.load = originalLoad;
  }
  console.log('A-Team run contracts validate and persist versioned canonical state.');
})().catch((error) => { console.error(error); process.exit(1); });
