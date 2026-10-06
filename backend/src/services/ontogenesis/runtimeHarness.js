'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { processRows, processAlive, treeRows, ownsProcess } = require('./processResources');
const { managedRoot, ensureIntegration } = require('./worktreeService');
const { terminatePid } = require('../processTermination');
const workerKinds = require('../agents/workerKindService');
const { instructionFor } = require('./philosophicalMissionContract');

const RUNNER = path.resolve(__dirname, '../../../bin/ontogenesisMissionRunner.cjs');

function createRuntimeHarness(db) {
  return {
    prepare: ensureIntegration,
    start: (input) => launch(db, input),
    observe: (run) => observeRun(run),
    stop: (run) => stopRun(db, run),
    resources: (project) => resources(db, project)
  };
}

function knownConceptIds(resolution, plan) {
  const resolvedIds = (resolution.resolvedConcepts || []).filter((concept) => concept.available).map((concept) => concept.id);
  const compatibleIds = (plan.compatibleRuntimeConcepts || []).map((concept) => concept.id);
  return [...new Set([...resolvedIds, ...compatibleIds])];
}

function philosophicalReferences(mission, plan) {
  return plan.philosophicalContracts?.contracts
    || (mission.concepts?.resolvedConcepts || [])
      .map((concept) => concept.implementationContractReference).filter(Boolean);
}

function conceptRequestFields(mission, plan) {
  const resolution = mission.concepts || {};
  const leasedTools = [...new Set((plan.runtimeLeaseCandidates || []).flatMap((candidate) => candidate.tools || []))];
  return {
    capabilityCatalog: mission.capabilityCatalog || [], conceptResolution: mission.concepts || null,
    conceptLeaseCandidates: plan.runtimeLeaseCandidates || [],
    philosophicalContracts: philosophicalReferences(mission, plan), runtimeBridges: plan.runtimeBridges || [],
    strategyConcept: plan.strategy || null, compatibleConcepts: plan.compatibleRuntimeConcepts || [],
    knownConcepts: knownConceptIds(resolution, plan), requiredTools: leasedTools
  };
}

function capabilityRequestFields(mission, plan) {
  const capabilities = mission.capabilities || [];
  return {
    capabilities, capabilityRequirements: capabilities,
    capabilityContract: plan.topologyContract || { required: capabilities },
    topologyContract: plan.topologyContract || null, existingCapabilities: capabilities,
    requiredCapabilities: plan.capabilityRequirements || capabilities
  };
}

function contextRequestFields(mission) {
  return {
    organization: mission.morphology?.selectedOrganization || undefined,
    developmentalContext: mission.developmentalContext || null, morphologyPlan: mission.morphology || null,
    missionCapabilityPlan: mission.plan || null, problemProfile: mission.profile || {}
  };
}

function workerAssignmentsFor(roles) {
  const workerAssignments = Object.fromEntries(roles.map((role) => [role, {
    workerKind: role,
    workerRequirements: { requiredCapabilities: workerRequirementsFor(role), allowedKinds: [role] }
  }]));
  return workerAssignments;
}

function requestFor(input) {
  const checks = input.config.checks || [];
  const roles = input.selection.workerRoles || [];
  const mission = input.mission || {};
  const plan = mission.plan || {};
  return {
    id: input.id, mission: `${topologyInstruction(input.selection.topology)}\n${input.project.objective}\n\nTask: ${input.task.title}\nAcceptance: ${input.task.acceptance_json}\nStrategy concept: ${JSON.stringify(input.mission?.plan?.strategy || {})}\nCanonical concepts: ${conceptInstruction(input.mission?.plan)}\nMorphogenesis: ${JSON.stringify(input.mission?.morphology || {})}\nDevelopmental context: ${developmentalInstruction(input.mission?.developmentalContext)}\nTopology: ${input.selection.topology}; variant: ${input.selection.variant}. Return executable evidence; do not commit or push.`,
    projectId: input.project.id, taskId: input.task.id, missionScope: input.worktree,
    autonomousOrchestration: true, useMemoryContext: true,
    proposedTopology: input.selection.topology, morphologyTopology: input.selection.topology,
    ...conceptRequestFields(mission, plan),
    ...capabilityRequestFields(mission, plan),
    ...contextRequestFields(mission),
    worker_assignments: workerAssignmentsFor(roles),
    requiresEvidenceBeforePromotion: true,
    workspaceRoot: input.worktree,
    trinityMode: input.selection.topology === 'trinity' ? 'explicit' : undefined,
    aTeamMode: input.selection.topology === 'a_team' ? 'explicit' : undefined,
    variant: input.selection.variant,
    timeoutMs: Math.floor(input.budgets.seconds * 600),
    executionBudget: { tokens: input.budgets.tokens, costUsd: input.budgets.usd, latencyMs: Math.floor(input.budgets.seconds * 600) },
    allowed_commands: checks.map((check) => [check.program, ...check.args].join(' ')),
    executor: input.config.executor || 'codex', provider: input.config.provider, modelId: input.config.modelId,
    allow_file_edits: input.config.authority?.allowEdit === true,
    explicit_write_lease: input.config.authority?.allowEdit === true
  };
}

function workerRequirementsFor(role) {
  return [...(workerKinds.KIND_CAPABILITIES[workerKinds.resolveWorkerKind(role)] || [])];
}

function developmentalInstruction(context) {
  if (!context) return 'unavailable';
  return JSON.stringify({
    shev: { available: context.shev?.available, pendingInitiatives: context.shev?.pendingInitiatives || 0 },
    gvx: { available: context.gvx?.available, eventCount: context.gvx?.eventCount || 0 },
    failClosed: context.failClosed === true
  });
}

function conceptInstruction(plan) {
  const source = plan || {};
  const compatible = arrayValue(source.compatibleRuntimeConcepts);
  const candidates = arrayValue(source.runtimeLeaseCandidates);
  const blocked = arrayValue(source.blockedCapabilities);
  const resolved = arrayValue(source.resolvedConcepts);
  return JSON.stringify({
    catalogueSize: arrayValue(source.canonicalConcepts).length,
    runtimeConcepts: arrayValue(source.runtimeConcepts).length,
    strategy: source.strategy?.strategyId || source.strategy?.id || null,
    compatible: compatible.map((concept) => concept.id).filter(Boolean),
    leasedTools: [...new Set(candidates.flatMap((candidate) => candidate.tools || []))],
    requested: resolved.map((concept) => ({ id: concept.id, source: concept.source,
      available: concept.available, executable: concept.executable, access: concept.access, reason: concept.reason })),
    blocked: blocked.map((entry) => entry.capability || entry.id).filter(Boolean),
    blockedConcepts: resolved.filter((concept) => !concept.available).map((concept) => concept.id).filter(Boolean),
    philosophicalContracts: source.philosophicalContracts?.contracts || [],
    philosophicalAuditInstructions: instructionFor(source.philosophicalContracts?.contracts || []),
    runtimeBridges: source.runtimeBridges || []
  });
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function topologyInstruction(topology) {
  if (topology === 'trinity') return 'Use Trinity.';
  if (topology === 'a_team') return 'Use A-Team.';
  return `Proposed morphology: ${topology}.`;
}

async function launch(db, input) {
  const databases = await db.all('PRAGMA database_list');
  const database = databases.find((entry) => entry.name === 'main');
  if (!database || !database.file) throw new Error('runtime-base-persistante-requise');
  const directory = path.join(managedRoot(input.project), 'requests');
  fs.mkdirSync(directory, { recursive: true });
  const requestPath = path.join(directory, `${input.id}.json`);
  fs.writeFileSync(requestPath, JSON.stringify(requestFor(input)), { flag: 'wx' });
  const child = spawn(process.execPath, [RUNNER, '--operation', input.id, requestPath], {
    cwd: path.resolve(__dirname, '../../../..'), detached: process.platform !== 'win32',
    windowsHide: true, stdio: 'ignore', shell: false,
    env: { ...process.env, GENOS_DB_PATH: database.file, GENOS_WORKSPACE_ROOT: input.worktree,
      GENOS_CAPSULE_ROOT: path.join(managedRoot(input.project), 'capsules'), GENOS_WORKTREE_GC_DELAY_MS: '-1' }
  });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  return { pid: child.pid, executable: RUNNER };
}

async function observeRun(run) {
  try {
    const rows = await processRows();
    const row = rows.find((entry) => entry.pid === run.pid);
    return { alive: ownsProcess(row, run, RUNNER), observable: true };
  } catch (error) {
    return { alive: processAlive(run.pid), observable: false, observationError: error.message };
  }
}

async function stopRun(db, run) {
  const runtime = require('../agentRuntimeAdapter');
  await runtime.stopMission(run.id);
  const row = (await processRows()).find((entry) => entry.pid === run.pid);
  if (ownsProcess(row, run, RUNNER)) terminatePid(run.pid);
  return !(await observeRun(run)).alive;
}

async function resources(db, project) {
  const executions = await db.all("SELECT * FROM ontogenesis_execution WHERE phase IN ('prepared','running','finished','verified')");
  let rows;
  try {
    rows = await processRows();
  } catch (_) {
    return { ownedMb: 0, reservationsMb: executions.filter((run) => !processAlive(run.pid)).reduce((sum, run) => sum + run.reservation_mb, 0) };
  }
  const roots = executions.filter((run) => ownsProcess(rows.find((row) => row.pid === run.pid), run, RUNNER)).map((run) => run.pid);
  const ownedMb = treeRows(rows, [process.pid, ...roots]).reduce((sum, row) => sum + row.mb, 0);
  const reservationsMb = executions.filter((run) => !roots.includes(run.pid)).reduce((sum, run) => sum + run.reservation_mb, 0);
  return { ownedMb, reservationsMb };
}

module.exports = { createRuntimeHarness, requestFor, RUNNER, conceptInstruction };
