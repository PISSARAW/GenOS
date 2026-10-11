'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const telemetry = require('../src/services/telemetryObserver');
const { persistATeamRun } = require('../src/services/agentAutonomyPlanService');
const snapshot = require('../src/services/topologySnapshots/aTeam');

const members = [
  { memberId: 'api', agentId: 'worker-api', workerId: 'worker-api', domain: 'api', role: 'engineer', capabilities: ['api'], outputs: ['api-contract'] },
  { memberId: 'web', agentId: 'worker-web', workerId: 'worker-web', domain: 'web', role: 'designer', capabilities: ['web'], outputs: ['site'] },
  { memberId: 'security', agentId: 'worker-security', workerId: 'worker-security', domain: 'security', role: 'reviewer', capabilities: ['security'], outputs: ['review'] }
];

async function run() {
  const oldSave = sessions.save;
  const oldLoad = sessions.load;
  const oldRemove = sessions.remove;
  const oldEmitEvent = telemetry.emitEvent;
  telemetry.emitEvent = () => {};
  const records = new Map();
  sessions.save = async (_db, record) => {
    const current = records.get(record.id);
    if (record.revision === undefined && current) throw new Error('duplicate');
    const revision = current ? current.revision + 1 : 0;
    records.set(record.id, { id: record.id, topology: record.topology, revision,
      state: JSON.parse(JSON.stringify(record.state)) });
    return { id: record.id, revision };
  };
  sessions.load = async (_db, id) => records.get(id) || null;
  sessions.remove = async (_db, id) => records.delete(id);
  const db = { get: async (sql) => sql.includes('FROM agents')
    ? { id: 'orchestrator', workspace_id: 'workspace', status: 'completed' }
    : { id: 'workspace', organization_id: 'org', project_id: 'project' } };
  try {
    const autonomyPlan = { aTeam: { activated: true, members, organization: 'specialist_expert_committee' } };
    await persistATeamRun({ db, agentId: 'orchestrator', normalizedMission: { prompt: 'Build a service' }, autonomyPlan });
    const teamRun = autonomyPlan.aTeam.teamRun;
    assert.equal(teamRun.execution.organizationPolicy.variant, 'project_dag');
    assert.equal(autonomyPlan.aTeam.workGraph.teamRunId, teamRun.teamRunId);
    const manifest = await snapshot.capture({ db, scope: {
      clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org', 'project']
    }, sessionId: teamRun.teamRunId, agentId: 'orchestrator', workspaceId: 'workspace', variantId: 'default' });
    assert.equal(manifest.components.find((item) => item.id === 'variant-policy').payload.variant, 'project_dag');
  } finally {
    sessions.save = oldSave;
    sessions.load = oldLoad;
    sessions.remove = oldRemove;
    telemetry.emitEvent = oldEmitEvent;
  }
  console.log('A-Team autonomous run persists a variant accepted by topology capture.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
