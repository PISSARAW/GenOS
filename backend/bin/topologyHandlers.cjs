'use strict';

const trinityService = require('../src/services/trinityService');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const workerGarage = require('../src/services/workerGarageService');
const aTeamDispatch = require('../src/services/aTeamDispatchService');
const biologicalTopology = require('../src/services/biologicalTopologyService');
const { randomUUID } = require('crypto');
const { workerLaunchPayload } = require('./workerLaunchPayload.cjs');
const { buildLaunchCapabilities } = require('../src/services/agents/agentIncarnationPayloadService');

function createOrchestratorId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function selectMembers(members, available) {
  if (!Array.isArray(members)) return [];
  if (available < members.length) {
    throw Object.assign(
      new Error(`Biological dispatch requires ${members.length} free worker slots, but only ${available} available`),
      { code: 'WORKER_GARAGE_FULL' }
    );
  }
  return members.slice();
}

function collectMechanisms(members) {
  const seen = new Set();
  for (const member of Array.isArray(members) ? members : []) {
    for (const mechanism of member.mechanisms || []) seen.add(mechanism);
  }
  return [...seen];
}

function buildBiologicalOutput({ context, mode, mission, members, accepted, topology }) {
  return {
    orchestratorId: context.orchestratorId,
    biologicalMode: {
      status: 'accepted', mode, mission,
      capacity: workerGarage.getDynamicCapacity(context.orchestratorId),
      mechanisms: collectMechanisms(members),
      ...topology, members: accepted
    }
  };
}

function getRunnerStdio(workerId) {
  const logDir = process.env.GENOS_RUNNER_LOG_DIR;
  if (!logDir) return 'ignore';
  try {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(logDir, { recursive: true });
    const fd = fs.openSync(path.join(logDir, `${workerId}.log`), 'a');
    return ['ignore', fd, fd];
  } catch {
    return 'ignore';
  }
}

function launchCapabilities(context, member) {
  return buildLaunchCapabilities({
    role: member.role,
    prompt: member.mission || context.task,
    domain: context.request?.domain,
    mode: context.request?.mode,
    organization: context.request?.organization,
    budgetTokens: context.request?.execution_budget?.tokens,
    capabilitiesHint: member.capabilities,
  });
}

function launchWorker({ context, member, index, parent, suppliedWorkerId }) {
  const workerId = suppliedWorkerId || createOrchestratorId(`worker_${context.orchestratorId}_${index}`);
  const launchCaps = launchCapabilities(context, member);
  const runnerEnv = {
    ...process.env,
    GENOS_LOCAL_MODEL: process.env.GENOS_LOCAL_MODEL || '',
    GENOS_AGENT_EXECUTOR: process.env.GENOS_AGENT_EXECUTOR || '',
    GENOS_DEFAULT_MODEL: process.env.GENOS_DEFAULT_MODEL || '',
    GENOS_RUNNER_LOG_DIR: process.env.GENOS_RUNNER_LOG_DIR || '',
    GENOS_EXECUTION_MODE: process.env.GENOS_EXECUTION_MODE || 'orchestrator'
  };
  const runner = require('child_process').spawn(
    process.execPath,
    [context.bridgePath, JSON.stringify(workerLaunchPayload({ context, member, workerId, parent, capabilities: launchCaps.capabilities, capabilityManifest: launchCaps.capabilityManifest, toolLease: launchCaps.toolLease }))],
    { cwd: context.repoRoot, detached: true, shell: true, stdio: getRunnerStdio(workerId), env: runnerEnv }
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
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, trinity: { status: 'accepted', mission, missionId, capacity: workerGarage.getDynamicCapacity(context.orchestratorId), worlds: accepted, supervision } }));
}

module.exports = { handleTeam, handleBiological, handleTrinity };
