'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { processRows, processAlive, treeRows, ownsProcess } = require('./processResources');
const { managedRoot, ensureIntegration } = require('./worktreeService');
const { terminatePid } = require('../processTermination');
const { launchInWindowsJob } = require('./windowsJobObject');
const workerKinds = require('../agents/workerKindService');
const { instructionFor } = require('./philosophicalMissionContract');
const { resolvePatchContract } = require('./patchContractService');
const { verifierCheckReason } = require('./gitAuthority');

const RUNNER = path.resolve(__dirname, '../../../bin/ontogenesisMissionRunner.cjs');
const SOURCE_PATH_PATTERN = /\b(?:src|lib|app|backend)[/\\][\w./\\-]+\.(?:[cm]?[jt]sx?)\b/i;
const IMPLEMENTATION_PATTERNS = [
  /\bexports?\b/i, /\bmodule\.exports\b/i, /\bfunction\b/i, /\breturns?\b/i,
  /\bthrows?\b/i, /\bimplement(?:ation)?\b/i, /\bmodify\b/i, /\bupdate\b/i,
  /\bchange\b/i, /\bimplementer\b/i, /\btypeerror\b/i
];

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

function requiredPhilosophicalContracts(contracts) {
  return (contracts || []).filter((contract) => contract.requiredForMission === true);
}

function philosophicalReferences(mission, plan) {
  const planned = requiredPhilosophicalContracts(plan.philosophicalContracts?.contracts);
  if (planned.length) return planned;
  return requiredPhilosophicalContracts((mission.concepts?.resolvedConcepts || [])
    .map((concept) => concept.implementationContractReference).filter(Boolean));
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

function capabilityRequestFields(mission, plan, selection) {
  const capabilities = mission.capabilities || [];
  return {
    capabilities, capabilityRequirements: capabilities,
    capabilityContract: plan.topologyContract || { required: capabilities },
    topologyContract: plan.topologyContract || null, existingCapabilities: capabilities,
    requiredCapabilities: plan.capabilityRequirements || capabilities,
    missionPreflight: selection?.preflight || plan.preflight || null
  };
}

function contextRequestFields(mission) {
  const plan = mission.plan;
  const morphology = plan?.morphology || mission.morphology || {};
  return require('./runtimeHarnessValues1.js').contextRequestFieldsValue1({ mission, morphology, plan, undefined });
}

function workerAssignmentsFor(roles) {
  const workerAssignments = Object.fromEntries(roles.map((role) => [role, {
    workerKind: role,
    workerRequirements: { requiredCapabilities: workerRequirementsFor(role), allowedKinds: [role] }
  }]));
  return workerAssignments;
}

function acceptanceValue(task) {
  let acceptance = task?.acceptance_json ?? task?.acceptance ?? [];
  if (typeof acceptance === 'string') {
    try { acceptance = JSON.parse(acceptance); } catch (_) { acceptance = [acceptance]; }
  }
  return acceptance;
}

function acceptanceText(task, acceptance) {
  return [task?.title, task?.goal, ...(Array.isArray(acceptance) ? acceptance : [acceptance])]
    .filter((value) => typeof value === 'string').join(' ');
}

function containsImplementationIntent(text) {
  return IMPLEMENTATION_PATTERNS.some((pattern) => pattern.test(text));
}

function acceptanceRequiresCodeChange(task) {
  const text = acceptanceText(task, acceptanceValue(task));
  return SOURCE_PATH_PATTERN.test(text) && containsImplementationIntent(text);
}

function isCodeTask(input) {
  const mission = input.mission || {};
  const taskIntent = `${input.task?.kind || ''} ${input.task?.title || ''} ${input.task?.goal || ''}`
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ['implement', 'repair'].includes(mission.kind)
    || /\b(?:implement(?:ation|er|ing)?|repair|fix|bug|patch|corrig(?:er|e|é))\b/i.test(taskIntent)
    || acceptanceRequiresCodeChange(input.task);
}

function minimumWorkerTokensForCodeTask(input, codeChangeTask) {
  if (!codeChangeTask) return null;
  const total = Number(input.budgets?.tokens);
  if (!Number.isFinite(total) || total <= 0) return null;
  // Local code workers may need a second generation to repair a failed
  // verifier run. Fund that repair pass without taking more than 15% per
  // worker from the mission's declared token budget.
  return Math.max(8000, Math.min(12000, Math.floor(total / 6)));
}

function requestFor(input) {
  const checks = verifierChecksForWorker(input.config.checks);
  const roles = input.selection.workerRoles || [];
  const mission = input.mission || {};
  const codeChangeTask = isCodeTask(input);
  const minimumWorkerTokens = minimumWorkerTokensForCodeTask(input, codeChangeTask);
  const plan = mission.plan || {};
  return {
    id: input.id, missionId: `mission_${input.id}`,
    mission: `${topologyInstruction(input.selection.topology)}\n${input.project.objective}\n\nTask: ${input.task.title}\nAcceptance: ${input.task.acceptance_json}\nStrategy concept: ${JSON.stringify(input.mission?.plan?.strategy || {})}\nCanonical concepts: ${conceptInstruction(input.mission?.plan)}\nMorphogenesis: ${JSON.stringify(input.mission?.morphology || {})}\nOperator memory: ${JSON.stringify(input.mission?.operatorContext || [])}\nDevelopmental context: ${developmentalInstruction(input.mission?.developmentalContext)}\nSensory context (advisory; verify before use): ${JSON.stringify(input.mission?.sensoryContext || {})}\nTopology: ${input.selection.topology}; variant: ${input.selection.variant}. Return executable evidence; do not commit, push, merge, or alter remotes.`,
    projectId: input.project.id, taskId: input.task.id, missionScope: input.worktree,
    workspaceId: 'ws-local',
    workspaceProvisioned: true,
    capsuleRoot: path.join(path.dirname(path.resolve(input.worktree)), 'capsules'),
    localCodeWorker: codeChangeTask,
    ...resolvePatchContract(input.config.patchContract),
    autonomousOrchestration: true, useMemoryContext: true,
    operatorContext: input.mission?.operatorContext || [],
    topologyId: input.selection.topology,
    proposedTopology: input.selection.topology, morphologyTopology: input.selection.topology,
    ...conceptRequestFields(mission, plan),
    ...capabilityRequestFields(mission, plan, input.selection),
    ...contextRequestFields(mission),
    worker_assignments: workerAssignmentsFor(roles),
    requiresEvidenceBeforePromotion: true,
    verifierChecks: checks,
    allowVerifierExecution: input.config.authority?.allowTests === true,
    verifierTimeoutMs: Math.min(input.budgets.seconds * 1000, 60000),
    workspaceRoot: input.worktree,
    trinityMode: input.selection.topology === 'trinity' ? 'explicit' : undefined,
    aTeamMode: input.selection.topology === 'a_team' ? 'explicit' : undefined,
    variant: input.selection.variant,
    timeoutMs: Math.floor(input.budgets.seconds * 600),
    executionBudget: { tokens: input.budgets.tokens, costUsd: input.budgets.usd,
      latencyMs: Math.floor(input.budgets.seconds * 600),
      ...(minimumWorkerTokens ? { minimumWorkerTokens } : {}) },
    allowed_commands: checks.map(workerAllowedCommand),
    executor: input.config.executor || 'codex', provider: input.config.provider, modelId: input.config.modelId,
    allow_file_edits: input.config.authority?.allowEdit === true,
    allowed_write_paths: Array.isArray(input.config.authority?.paths)
      ? [...input.config.authority.paths] : undefined,
    explicit_write_lease: input.config.authority?.allowEdit === true,
    git_authority: { localCommit: false, push: false, merge: false, remoteMutation: false }
  };
}

function verifierChecksForWorker(checks) {
  const resolved = checks || [];
  for (const check of resolved) {
    const reason = verifierCheckReason(check);
    if (reason) throw new Error(reason);
  }
  return resolved;
}

function workerAllowedCommand(check) {
  const program = path.basename(check.program || '').toLowerCase();
  const args = Array.isArray(check.args) ? check.args : [];
  if (program === 'node.exe' || program === 'node') return ['node', ...args].join(' ');
  return [check.program, ...args].join(' ');
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
  const philosophy = requiredPhilosophicalContracts(source.philosophicalContracts?.contracts);
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
    philosophicalContracts: philosophy,
    philosophicalAuditInstructions: instructionFor(philosophy),
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

function runtimeEnvironment(databaseFile, input) {
  return { ...process.env, GENOS_DB_PATH: databaseFile, GENOS_WORKSPACE_ROOT: input.worktree,
    GENOS_CAPSULE_ROOT: path.join(managedRoot(input.project), 'capsules'), GENOS_WORKTREE_GC_DELAY_MS: '-1' };
}

async function startRuntime(input, environment) {
  const cwd = path.resolve(__dirname, '../../../..');
  const args = [RUNNER, '--operation', input.id, input.requestPath];
  if (process.platform === 'win32') {
    const started = await launchInWindowsJob({ application: process.execPath, arguments: args,
      cwd, env: environment, ownerPid: process.pid, memoryMb: input.reservationMb });
    return { ...started, executable: RUNNER };
  }
  const child = spawn(process.execPath, args, { cwd, detached: true,
    windowsHide: true, stdio: 'ignore', shell: false, env: environment });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  return { pid: child.pid, executable: RUNNER, confinement: 'process-group' };
}

async function launch(db, input) {
  const databases = await db.all('PRAGMA database_list');
  const database = databases.find((entry) => entry.name === 'main');
  if (!database || !database.file) throw new Error('runtime-base-persistante-requise');
  const directory = path.join(managedRoot(input.project), 'requests');
  fs.mkdirSync(directory, { recursive: true });
  const requestPath = path.join(directory, `${input.id}.json`);
  fs.writeFileSync(requestPath, JSON.stringify(requestFor(input)), { flag: 'wx' });
  return startRuntime({ ...input, requestPath }, runtimeEnvironment(database.file, input));
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

module.exports = { createRuntimeHarness, requestFor, isCodeTask, acceptanceRequiresCodeChange, RUNNER, conceptInstruction };
