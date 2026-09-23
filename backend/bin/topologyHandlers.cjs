'use strict';

const trinityService = require('../src/services/trinityService');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const workerGarage = require('../src/services/workerGarageService');
const aTeamDispatch = require('../src/services/aTeamDispatchService');
const biologicalTopology = require('../src/services/biologicalTopologyService');
const { randomUUID } = require('crypto');
const { workerLaunchPayload } = require('./workerLaunchPayload.cjs');

function createOrchestratorId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function selectMembers(members, available) {
  return members.slice(0, available);
}

function buildBiologicalOutput({ context, mode, mission, members, accepted, topology }) {
  return {
    orchestratorId: context.orchestratorId,
    biologicalMode: {
      status: 'accepted', mode, mission,
      capacity: workerGarage.MAX_ACTIVE_WORKERS,
      mechanisms: members[0]?.mechanisms || [],
      ...topology, members: accepted
    }
  };
}

function getRunnerStdio(workerId) {
  const path = require('path');
  const fs = require('fs');
  const logDir = path.join(process.cwd(), 'logs', 'workers');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${workerId}.log`);
  return ['ignore', fs.openSync(logPath, 'a'), fs.openSync(logPath, 'a')];
}

function launchWorker({ context, member, index, parent, suppliedWorkerId }) {
  const workerId = suppliedWorkerId || createOrchestratorId(`worker_${context.orchestratorId}_${index}`);
  const runner = require('child_process').spawn(
    process.execPath,
    [context.bridgePath, JSON.stringify(workerLaunchPayload({ context, member, workerId, parent }))],
    { cwd: context.repoRoot, detached: true, stdio: getRunnerStdio(workerId) }
  );
  runner.unref();
  return {
    workerId,
    subSystem: member.subSystem,
    memberNumber: member.memberNumber || index,
    role: member.role,
    modelTier: member.modelTier,
    status: 'accepted',
  };
}

async function ensureParent({ db, context }) {
  const contracts = require('../src/services/strategyContractService');
  let parent = await db.get(
    "SELECT a.id, a.status, a.is_apoptotic, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
    context.orchestratorId
  );
  if (parent && (parent.is_apoptotic || ['apoptosis', 'completed', 'terminated', 'error', 'failed', 'unverified', 'quarantined'].includes(parent.status))) {
    context.orchestratorId = createOrchestratorId('mcp_orchestrator');
    await db.run(
      `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`,
      context.orchestratorId, context.task
    );
    parent = await db.get(
      "SELECT a.id, a.status, a.is_apoptotic, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
      context.orchestratorId
    );
  }
  if (!parent) throw new Error(`Orchestrator '${context.orchestratorId}' was not found.`);
  if (!await contracts.getLatestContract(db, context.orchestratorId)) {
    await contracts.saveContract(db, { agentId: context.orchestratorId, problem: context.task, createdBy: 'mcp_' + context.action });
  }
  return parent;
}

function buildNCEEnrichments(context, topology) {
  const nceService = require('../src/services/topologyNCEService');
  return nceService.computeNCEForTopology(
    context.task,
    nceService.buildTopologyOptions(context, topology)
  );
}

async function handleTeam(db, context) {
  const parent = await ensureParent({ db, context });
  context.nceEnrichments = await buildNCEEnrichments(context, 'team');
  const result = await aTeamDispatch.dispatchTeam({ db, context, parent, launchWorker });
  process.stdout.write(JSON.stringify(result));
}

async function handleBiological(db, context) {
  const parent = await ensureParent({ db, context });
  const mode = String(context.request.mode || '').trim().toLowerCase();
  const mission = context.request.mission || context.request.project_goal || context.request.goal || context.task;
  context.nceEnrichments = await buildNCEEnrichments(context, 'biological');
  const composition = await biologicalTopology.composeMode({
    db, orchestratorId: context.orchestratorId, mode, mission,
    options: { agentCount: context.request.agent_count, clusterSize: context.request.cluster_size, fanout: context.request.fanout, organization: context.request.organization }
  });
  const members = composition.members || [];
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available <= 0) throw Object.assign(new Error(`${mode} requires free worker slots, but worker garage is full`), { code: 'WORKER_GARAGE_FULL' });
  const selected = selectMembers(members, garage.available);
  const accepted = selected.map((member, index) => launchWorker({ context, member, index: index + 1, parent }));
  const topology = composition ? { organization: composition.organization, capabilityContract: composition.capabilityContract } : {};
  const out = buildBiologicalOutput({ context, mode, mission, members, accepted, topology });
  process.stdout.write(JSON.stringify(out));
}

async function handleTrinity(db, context) {
  const parent = await ensureParent({ db, context });
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available < 3) throw Object.assign(new Error(`Trinity requires 3 free worker slots`), { code: 'WORKER_GARAGE_FULL' });
  const mission = context.request.mission || context.request.project_goal || context.request.goal || 'Trinity comparative mission';
  context.nceEnrichments = await buildNCEEnrichments(context, 'trinity');
  const members = trinityService.compose(mission);
  const missionId = `trinity_${context.orchestratorId}_${randomUUID()}`;
  const accepted = [];
  for (const member of members) {
    const workerId = createOrchestratorId(`worker_${context.orchestratorId}_${member.worldNumber}`);
    const trinityName = `Trinity Worker (World ${member.worldNumber}: ${member.label})`;
    await db.run(
      `INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id) VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
      `${missionId}_world_${member.worldNumber}`, mission, member.worldNumber, trinityName, member.role, workerId
    );
    launchWorker({ context, member: { ...member, name: trinityName }, index: member.worldNumber, parent, suppliedWorkerId: workerId });
    accepted.push({ workerId, worldNumber: member.worldNumber, strategy: member.role, status: 'accepted' });
  }
  const supervision = trinityMissionSupervisor.launch({ missionId, orchestratorId: context.orchestratorId, repoRoot: context.repoRoot });
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, trinity: { status: 'accepted', mission, missionId, capacity: workerGarage.MAX_ACTIVE_WORKERS, worlds: accepted, supervision } }));
}

module.exports = { handleTeam, handleBiological, handleTrinity };
