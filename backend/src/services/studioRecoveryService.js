'use strict';
const { agent, failure } = require('./studioWorldsService');
const state = require('./agentOrchestrationState');

function processObservation(current) {
  const pid = current.runtime_pid || state.activeProcesses.get(current.id)?.pid;
  if (!pid) return { runtimePid: null, processAlive: null, processObservation: 'unverified' };
  try { process.kill(Number(pid), 0); return { runtimePid: pid, processAlive: true, processObservation: 'pid_alive' }; }
  catch (error) { return { runtimePid: pid, processAlive: error.code === 'ESRCH' ? false : null, processObservation: error.code }; }
}

async function inspect(db, context) {
  const current = await agent(db, context);
  const incidents = await db.all(`SELECT id, title, status, severity, agent_name, workspace_name, created_at
    FROM global_alerts WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50`,
  context.scope.organizationId, context.scope.projectId);
  const snapshots = await db.all(`SELECT id, label, snapshot_hash, step_number, created_at FROM workspace_snapshots
    WHERE workspace_id = ? ORDER BY step_number DESC LIMIT 50`, current.workspace_id);
  const latest = await require('./consumerInspectionService').inspect(db, { agentId: current.id, scope: context.scope });
  return { agent: { id: current.id, name: current.name, status: current.status,
    dissonance: current.dissonance_level, cognitiveBudget: current.cognitive_budget, ...processObservation(current) },
    workspaceId: current.workspace_id, incidents, snapshots, executionAuthority: latest?.executionAuthority || null,
    nativeVerification: latest?.nativeVerification || null, diagnosisEstablished: false,
    recoveryScope: 'workspace_files', externalEffectsReversible: false, incidentDisplayLimit: 50 };
}

async function stop(db, context) {
  if (context.body.confirmed !== true) throw failure('CONFIRMATION_REQUIRED', 409);
  await agent(db, context);
  return require('./studioStopService').stop(db, { agentId: context.agentId, scope: context.scope });
}

module.exports = { inspect, stop };
