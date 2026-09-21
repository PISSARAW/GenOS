'use strict';

const trinityService = require('../src/services/trinityService');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const { workerGarage } = require('../src/services/garage');
const { randomUUID } = require('crypto');

// ─── Fonctions utilitaires locales (pas de dépendance circulaire) ────

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
      ...topology, members: accepted,
    },
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

function workerLaunchPayload({ context, member, workerId, parent }) {
  const { aTeamService } = require('../src/services/aTeamService');
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: context.orchestratorId,
    workerId,
    mission: member.mission,
    role: member.role,
    model_tier: member.modelTier,
    ...(member.name ? { name: member.name } : {}),
    ...(Array.isArray(member.dependsOn) && member.dependsOn.length ? { depends_on: member.dependsOn } : {}),
    ...(member.pipelineStage ? { pipeline_stage: member.pipelineStage } : {}),
    ...(member.engine === 'local' ? { localRuntime: true } : {}),
    execution_budget: context.request.execution_budget || context.request.executionBudget,
    timeoutMs: context.request.timeoutMs,
    workspace_root: context.request.workspace_root || parent.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
  };
}

async function ensureParent({ db, context }) {
  const contracts = require('../src/services/contracts');
  const { createOrchestratorId: createId } = require('./orchestratorActions');
  let parent = await db.get(
    "SELECT a.id, a.status, a.is_apoptotic, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
    context.orchestratorId
  );
  if (parent && (parent.is_apoptotic || ['apoptosis', 'completed', 'terminated', 'error', 'failed', 'unverified', 'quarantined'].includes(parent.status))) {
    context.orchestratorId = createId('mcp_orchestrator');
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
  return nceService.computeNCEForTopology(context.task, {
    topology,
    role: topology + '_agent',
    domain: context.request?.domain || context.request?.problem_domain,
    keywords: context.request?.keywords || [],
    budget: context.request?.execution_budget || context.request?.executionBudget || {},
  });
}

// ─── Handlers de topologies avec NCE ────────────────────────────────

async function handleTeam(db, context) {
  const parent = await ensureParent({ db, context });
  context.nceEnrichments = await buildNCEEnrichments(context, 'team');
  const { aTeamDispatch } = require('./orchestratorActions');
  const result = await aTeamDispatch.dispatchTeam({ db, context, parent, launchWorker });
  process.stdout.write(JSON.stringify(result));
}

async function handleBiological(db, context) {
  const parent = await ensureParent({ db, context });
  const mode = String(context.request.mode || '').trim().toLowerCase();
  const mission = context.request.mission || context.request.project_goal || context.request.goal || context.task;
  context.nceEnrichments = await buildNCEEnrichments(context, 'biological');
  const { biologicalTopology } = require('./orchestratorActions');
  const composition = await biologicalTopology.composeMode({
    db, orchestratorId: context.orchestratorId, mode, mission,
    options: { agentCount: context.request.agent_count, clusterSize: context.request.cluster_size, fanout: context.request.fanout, organization: context.request.organization },
  });
  const members = composition.members || [];
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available <= 0) {
    const msg = `${mode} requires free worker slots, but worker garage is full (slots: ${garage.occupied}/${garage.capacity} used)`;
    throw Object.assign(new Error(msg), { code: 'WORKER_GARAGE_FULL' });
  }
  const selected = selectMembers(members, garage.available);
  const accepted = selected.map((member, index) => launchWorker({ context, member, index: index + 1, parent }));
  const topology = composition ? { organization: composition.organization, capabilityContract: composition.capabilityContract } : {};
  const out = buildBiologicalOutput({ context, mode, mission, members, accepted, topology });
  process.stdout.write(JSON.stringify(out));
}

async function handleTrinity(db, context) {
  const parent = await ensureParent({ db, context });
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available < 3) throw Object.assign(new Error(`Trinity requires 3 free worker slots, but worker garage is full (slots: ${garage.occupied}/${garage.capacity} used — wait or increase MAX_ACTIVE_WORKERS).`), { code: 'WORKER_GARAGE_FULL' });
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
