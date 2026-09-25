'use strict';

const topologyTrinityHandler = require('./topologyTrinityHandler.cjs');
const metapopulationMissionResults = require('../src/services/metapopulation/metapopulationMissionResultService');
const workerGarage = require('../src/services/workerGarageService');
const aTeamDispatch = require('../src/services/aTeamDispatchService');
const biologicalTopology = require('../src/services/biologicalTopologyService');
const { randomUUID } = require('crypto');
const { workerLaunchPayload } = require('./workerLaunchPayload.cjs');
const { buildLaunchCapabilities } = require('../src/services/agents/agentIncarnationPayloadService');
const { ensureTopologyWorker } = require('../src/services/topologyWorkerPersistenceService');
const detachedSpawn = require('./detachedSpawn.cjs');
const rhizomeMissionRunner = require('../src/services/rhizome/rhizomeMissionRunnerService');

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
      ...topology, members: accepted,
      ...(mode === 'metapopulation' ? {
        status: metapopulationComplete(accepted, members) ? 'completed' : 'partial',
        complete: metapopulationComplete(accepted, members),
        migrationReviewStatus: accepted.length === members.length && accepted.every((member) => isVerifiedResult(member.result)) ? 'completed' : 'partial',
        results: accepted.map((member) => member.result || null),
        answer: accepted.map((member) => `## ${member.role}\n${populationAnswer(member)}`).join('\n\n')
      } : {})
    }
  };
}

function metapopulationComplete(accepted, members) {
  const reviewedComplete = accepted.length === members.length && accepted.every((member) => isVerifiedResult(member.result));
  return reviewedComplete;
}

function isVerifiedResult(result) {
  return result?.status === 'completed' && result.methodValidated !== false && result.domainValidation?.valid !== false;
}

function populationAnswer(member) {
  const review = isVerifiedResult(member.result) ? member.result.answer : null;
  if (review) return review;
  const initial = member.result?.initialResults?.find((result) => result.role === member.role);
  return isVerifiedResult(initial) ? initial.answer : 'Aucune réponse vérifiée.';
}

function getRunnerStdio(workerId) {
  return detachedSpawn.openRunnerStdio(workerId);
}

function launchCapabilities(context, member) {
  return buildLaunchCapabilities({
    role: member.role,
    prompt: member.mission || context.task,
    domain: context.request?.domain,
    mode: context.request?.mode,
    organization: context.request?.organization,
    budgetTokens: Number.isFinite(member.executionBudgetTokens) ? member.executionBudgetTokens : context.request?.execution_budget?.tokens,
    capabilitiesHint: member.capabilities,
  });
}

async function launchWorker({ db, context, member, index, parent, suppliedWorkerId }) {
  const workerId = suppliedWorkerId || createOrchestratorId(`worker_${context.orchestratorId}_${index}`);
  const launchCaps = launchCapabilities(context, member);
  await persistWorkerIdentity({ db, context, member, parent, workerId });
  await spawnTopologyWorker({ db, context, member, parent, workerId, launchCaps });
  return workerSummary(member, index, workerId);
}

function persistWorkerIdentity({ db, context, member, parent, workerId }) {
  return ensureTopologyWorker(db, {
    workerId,
    parentId: context.orchestratorId,
    workspaceId: parent.workspace_id,
    isolationMode: parent.isolation_mode,
    modelTier: member.modelTier || parent.model_tier,
    name: member.name || member.label || member.role,
    role: member.role || 'worker',
    workerKind: member.workerKind,
    methodContract: member.methodContract,
    workerAssignment: member.workerAssignment,
    mission: member.mission || context.task
  });
}

function runnerEnvironment() {
  return {
    ...process.env,
    GENOS_LOCAL_MODEL: process.env.GENOS_LOCAL_MODEL || '',
    GENOS_AGENT_EXECUTOR: process.env.GENOS_AGENT_EXECUTOR || '',
    GENOS_DEFAULT_MODEL: process.env.GENOS_DEFAULT_MODEL || '',
    GENOS_RUNNER_LOG_DIR: detachedSpawn.runtimeDirectory(),
    GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_BOOTSTRAP_SKIP: '1',
    GENOS_EXECUTION_MODE: 'orchestrator'
  };
}

async function spawnTopologyWorker({ db, context, member, parent, workerId, launchCaps }) {
  const awaitWorker = context.request.mode === 'rhizome' || process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1';
  const payload = workerLaunchPayload({ context, member, workerId, parent,
    capabilities: launchCaps.capabilities, capabilityManifest: launchCaps.capabilityManifest,
    toolLease: launchCaps.toolLease });
  const args = [context.bridgePath, ...detachedSpawn.toSpawnArgs(JSON.stringify(payload))];
  const log = getRunnerStdio(workerId);
  const runner = require('child_process').spawn(process.execPath,
    args,
    { cwd: context.repoRoot, detached: !awaitWorker, shell: false,
      windowsHide: true, stdio: log.stdio, env: runnerEnvironment() });
  runner.once('spawn', log.close);
  runner.once('error', log.close);
  await waitForWorkerStart(runner, db, workerId);
  if (awaitWorker) await waitForWorkerExit(runner, db, workerId);
}

async function waitForWorkerStart(runner, db, workerId) {
  try {
    await new Promise((resolve, reject) => {
      runner.once('spawn', resolve);
      runner.once('error', reject);
    });
  } catch (error) {
    await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, workerId);
    throw error;
  }
}

async function waitForWorkerExit(runner, db, workerId) {
  const exitCode = await new Promise((resolve) => runner.once('close', resolve));
  if (exitCode === 0) return;
  await db.run("UPDATE agents SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'idle'", workerId);
  throw new Error('Topology worker ' + workerId + ' exited with code ' + exitCode + '; inspect its runner log.');
}

function workerSummary(member, index, workerId) {
  return {
    workerId,
    subSystem: member.subSystem,
    memberNumber: member.memberNumber || index,
    role: member.role,
    branchCandidateId: member.branchCandidateId,
    branchCandidateLabel: member.branchCandidateLabel,
    branchCandidateReason: member.branchCandidateReason,
    modelTier: member.modelTier,
    mission: member.mission,
    status: 'accepted',
  };
}

async function ensureParent({ db, context }) {
  const contracts = require('../src/services/strategyContractService');
  let parent = await db.get(
    "SELECT a.id, a.status, a.is_apoptotic, a.workspace_id, a.model_tier, a.isolation_mode, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
    context.orchestratorId
  );
  if (isUnavailableParent(parent)) parent = await replaceParent(db, context);
  if (!parent) throw new Error(`Orchestrator '${context.orchestratorId}' was not found.`);
  if (!await contracts.getLatestContract(db, context.orchestratorId)) {
    await contracts.saveContract(db, { agentId: context.orchestratorId, problem: context.task, createdBy: 'mcp_' + context.action });
  }
  return parent;
}

function isUnavailableParent(parent) {
  return Boolean(parent && (parent.is_apoptotic || ['apoptosis', 'completed', 'terminated', 'error', 'failed', 'unverified', 'quarantined'].includes(parent.status)));
}

async function replaceParent(db, context) {
  context.orchestratorId = createOrchestratorId('mcp_orchestrator');
  await db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`,
    context.orchestratorId, context.task
  );
  return db.get(
    "SELECT a.id, a.status, a.is_apoptotic, a.workspace_id, a.model_tier, a.isolation_mode, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
    context.orchestratorId
  );
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
  const composition = await composeBiologicalMode({ db, context, mode, mission });
  const members = composition.members || [];
  const accepted = await dispatchAndCollectResults({ db, context, mode, parent, members });
  const topology = topologyDetails(composition);
  const out = buildBiologicalOutput({ context, mode, mission, members, accepted, topology });
  await applyRhizomeResults({ db, context, mode, topology, accepted, parent, output: out });
  process.stdout.write(JSON.stringify(out));
}

async function dispatchAndCollectResults({ db, context, mode, parent, members }) {
  const accepted = await dispatchBiologicalMembers({ db, context, mode, parent, members });
  if (mode !== 'metapopulation') return accepted;
  return dispatchMetapopulationReview({ db, context, parent, members, initialWorkers: accepted });
}

async function dispatchMetapopulationReview({ db, context, parent, members, initialWorkers }) {
  const initialSettled = await waitForMetapopulationWorkers(db, initialWorkers, context.request.timeoutMs);
  for (const member of initialWorkers) member.result = await metapopulationMissionResults.read(db, member);
  const initial = initialWorkers.map((member) => ({ role: member.role, ...member.result }));
  if (!initialSettled) {
    for (const member of initialWorkers) member.result.initialResults = initial;
    return initialWorkers;
  }
  let candidates = initial;
  let accepted = initialWorkers;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    accepted = await reviewMetapopulationCandidates({ db, context, parent, members, candidates });
    await waitForMetapopulationWorkers(db, accepted, context.request.timeoutMs);
    for (const member of accepted) {
      member.result = await metapopulationMissionResults.read(db, member);
      member.result.initialResults = initial;
    }
    candidates = accepted.map((member) => ({ role: member.role, ...member.result }));
    if (accepted.every((member) => isVerifiedResult(member.result))) break;
  }
  return accepted;
}

function reviewMetapopulationCandidates({ db, context, parent, members, candidates }) {
  const reviewMembers = members.map((member) => ({
    ...member, mission: metapopulationMissionResults.reviewPrompt(member, candidates)
  }));
  return dispatchBiologicalMembers({ db, context, mode: 'metapopulation', parent, members: reviewMembers });
}

async function waitForMetapopulationWorkers(db, members, timeoutMs) {
  const requested = Number(timeoutMs);
  const limit = Number.isFinite(requested) ? Math.max(10000, Math.min(requested, 600000)) : 180000;
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const rows = await Promise.all(members.map((member) => db.get('SELECT status FROM agents WHERE id = ?', member.workerId)));
    if (rows.every((row) => ['completed', 'failed', 'error', 'blocked', 'unverified', 'terminated', 'quarantined'].includes(row?.status))) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function topologyDetails(composition) {
  if (!composition) return {};
  return {
    organization: composition.organization,
    capabilityContract: composition.capabilityContract,
    sessionId: composition.sessionId || composition.rhizomeId || null,
    graphVersion: composition.graphVersion ?? null
  };
}

async function applyRhizomeResults({ db, context, mode, topology, accepted, parent, output }) {
  if (mode !== 'rhizome' || !topology.sessionId) return;
  const discovery = await rhizomeMissionRunner.completeMission({
    db, sessionId: topology.sessionId, accepted, mission: output.biologicalMode.mission,
    dispatch: (members) => dispatchRhizomeMissionMembers({ db, context, members, parent })
  });
  const { result, discoveredBranches } = discovery;
  output.biologicalMode.members.push(...discoveredBranches);
  Object.assign(output.biologicalMode, result, { status: result.status, graphVersion: result.graph.graphVersion });
}

function dispatchRhizomeMissionMembers({ db, context, members, parent }) {
  return rhizomeMissionRunner.dispatchMembers({
    members,
    hasCapacity: async () => (await workerGarage.state(db, context.orchestratorId)).available > 0,
    launch: (member, index) => launchWorker({ db, context, member, index, parent })
  });
}

async function dispatchBiologicalMembers({ db, context, mode, parent, members }) {
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available <= 0) throw Object.assign(new Error(`${mode} requires free worker slots, but worker garage is full`), { code: 'WORKER_GARAGE_FULL' });
  const selected = selectMembers(members, garage.available);
  if (mode === 'rhizome') return dispatchRhizomeMissionMembers({ db, context, members: selected, parent });
  if (mode === 'metapopulation' || process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1') {
    const completed = [];
    for (let offset = 0; offset < selected.length; offset += 2) {
      const pair = selected.slice(offset, offset + 2);
      if (mode === 'metapopulation') {
        completed.push(...await Promise.all(pair.map((member, index) =>
          launchWorker({ db, context, member, index: offset + index + 1, parent }))));
        continue;
      }
      const pairResults = await Promise.allSettled(
        pair.map((member, index) => launchWorker({ db, context, member, index: offset + index + 1, parent }))
      );
      for (const result of pairResults) {
        if (result.status === 'fulfilled') {
          completed.push(result.value);
        } else {
          console.error(`[topology] Worker launch failed: ${result.reason?.message || result.reason}`);
        }
      }
    }
    return completed;
  }
  return Promise.all(selected.map((member, index) => launchWorker({ db, context, member, index: index + 1, parent })));
}

function composeBiologicalMode({ db, context, mode, mission }) {
  const { agent_count: agentCount, cluster_size: clusterSize, fanout, organization } = context.request;
  const workerAssignments = context.request.worker_assignments || context.request.workerAssignments;
  return biologicalTopology.composeMode({
    db, orchestratorId: context.orchestratorId, mode, mission,
    options: { agentCount, clusterSize, fanout, organization, workerAssignments }
  });
}

async function handleTrinity(db, context) {
  return topologyTrinityHandler.handle({ db, context, ensureParent, workerGarage, buildNCEEnrichments, createOrchestratorId, launchWorker });
}

module.exports = { handleTeam, handleBiological, handleTrinity };
