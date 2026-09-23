const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const runtime = require('../src/services/agentRuntimeAdapter');
const { createOrchestratorId } = require('../src/services/orchestratorIdFactory');
const contracts = require('../src/services/strategyContractService');
const workerGarage = require('../src/services/workerGarageService');
const aTeamService = require('../src/services/aTeamService');
const aTeamDispatch = require('../src/services/aTeamDispatchService');
const trinityService = require('../src/services/trinityService');
const trinityComparativeBarrier = require('../src/services/trinityComparativeBarrier');
const trinityMissionSupervisor = require('../src/services/trinityMissionSupervisor');
const biologicalTopology = require('../src/services/biologicalTopologyService');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const telemetry = require('../src/services/telemetryObserver');
const strategyAdaptation = require('../src/services/strategyAdaptationService');
const userProgress = require('../src/services/userProgressService');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const { dispatchWorkerMission } = require('../src/services/orchestratorDispatchService');
async function findReusableWorker({ context, db }) {
  if (context.action !== 'dispatch_worker' || context.request.workerId) return null;
  return workerGarage.findReusableWorker(db, context.orchestratorId, {
    mission: context.task, role: String(context.request.role || 'implementation')
  });
}
function getRunnerStdio(processId) {
  const logDir = process.env.GENOS_RUNNER_LOG_DIR;
  if (!logDir) return 'ignore';
  try {
    const fs = require('fs');
    fs.mkdirSync(logDir, { recursive: true });
    const fd = fs.openSync(path.join(logDir, `${processId}.log`), 'a');
    return ['ignore', fd, fd];
  } catch {
    return 'ignore';
  }
}
async function handleBackground(context) {
  let reusableWorker = null;
  if (context.action === 'dispatch_worker') {
    const lookupDb = await context.getDatabase();
    try {
      reusableWorker = await findReusableWorker({ context, db: lookupDb });
      if (reusableWorker) context.id = reusableWorker.id;
    } finally { await context.closeDatabase(); }
  }
  const detachedProcessId = createOrchestratorId('orchestrator-runner');
  const runnerRequest = {
    ...context.request, background: false, detachedProcessId,
    orchestratorId: context.orchestratorId,
    workerId: context.action === 'dispatch_worker' ? context.id : context.request.workerId,
    ...(context.action === 'dispatch_worker' ? { reuseChecked: true, reuseWorkerId: reusableWorker?.id || null } : {})
  };
  const runner = spawn(process.execPath, [context.bridgePath, JSON.stringify(runnerRequest)], { cwd: context.repoRoot, detached: true, stdio: getRunnerStdio(detachedProcessId) });
  runner.unref();
  let trackingDb = null;
  try {
    trackingDb = await context.getDatabase();
    await trackingDb.exec(`CREATE TABLE IF NOT EXISTS detached_processes (id TEXT PRIMARY KEY, pid INTEGER NOT NULL, kind TEXT NOT NULL, owner_id TEXT, command TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await trackingDb.run('INSERT INTO detached_processes (id, pid, kind, owner_id, command) VALUES (?, ?, ?, ?, ?)', detachedProcessId, runner.pid, 'orchestrator', context.orchestratorId, process.execPath);
  } catch (error) {
    try { runner.kill('SIGTERM'); } catch (_) { /* best effort cleanup */ }
    throw new Error(`Detached runner tracking failed: ${error.message}`, { cause: error });
  } finally {
    if (trackingDb) await context.closeDatabase();
  }
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, detachedProcessId, runnerPid: runner.pid, ...(context.action === 'dispatch_worker' ? { workerId: context.id, reusedWorker: Boolean(reusableWorker), ...(reusableWorker ? { matchedScope: reusableWorker.affinity.shared } : {}) } : {}), status: 'accepted', acceptedAt: new Date().toISOString(), task: context.task }));
}
async function initializeMission({ db, action, orchestratorId, task }) {
  const actions = ['dispatch_worker', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological'];
  if (!actions.includes(action)) return;
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
    VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, orchestratorId, task);
  if (!await contracts.getLatestContract(db, orchestratorId)) {
    await contracts.saveContract(db, { agentId: orchestratorId, problem: task, createdBy: 'mcp_' + action });
  }
}
async function handleOntologyRequest({ request, orchestratorId }) {
  const ontologyRouter = require('../src/services/ontologyRouter');
  const result = await ontologyRouter.handleOntologyRequest({ request, orchestratorId });
  process.stdout.write(JSON.stringify({ orchestratorId, ontology: result }));
}
async function handlePhilosophyRequest({ request, orchestratorId }) {
  const philosophyRouter = require('../src/services/philosophyRouter');
  const result = await philosophyRouter.handlePhilosophyRequest({ request, orchestratorId });
  process.stdout.write(JSON.stringify({ orchestratorId, philosophy: result }));
}

async function handleReportProgress({ db, request, orchestratorId, task }) {
  const parent = await ensureProgressParent({ db, orchestratorId, task });
  if (!parent) throw new Error(`Orchestrator '${orchestratorId}' was not found.`);
  process.stdout.write(JSON.stringify(userProgress.report(progressPayload({ request, orchestratorId }))));
}
async function ensureProgressParent({ db, orchestratorId, task }) {
  let parent = await db.get("SELECT id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
  if (parent) return parent;
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, orchestratorId, task);
  return db.get("SELECT id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
}
function progressPayload({ request, orchestratorId }) {
  return {
    orchestratorId, sourceAgentId: process.env.GENOS_AGENT_ID || orchestratorId,
    phase: firstValue(request.phase, request.stage, 'in_progress'),
    message: firstValue(request.message, request.status, request.description, request.detail, request.phase, 'Progress update'),
    progressPercent: firstPresent(request.progress_percent, request.progressPercent, request.progress),
    completed: request.completed, next: request.next, blockers: request.blockers,
    silent: /^(1|true)$/i.test(String(process.env.GENOS_SILENT_UPDATES || ''))
  };
}
function firstValue(...values) { return values.find(Boolean); }
function firstPresent(...values) { return values.find((value) => value !== undefined && value !== null); }
function primitiveContext(request, orchestratorId) {
  const context = request.args && typeof request.args === 'object' ? { ...request.args } : { ...(request.context || {}) };
  if (request.agentId && !context.agentId) context.agentId = request.agentId;
  if (orchestratorId && !context.orchestratorId) context.orchestratorId = orchestratorId;
  return context;
}
async function handlePrimitive({ request, orchestratorId }) {
  const primitive = String(request.primitive || request.primitive_name || '').trim();
  if (!primitive) throw new Error('primitive_name is required.');
  const adapter = require('../src/services/strategyExecutionAdapter');
  process.stdout.write(JSON.stringify(await adapter.executePrimitive(primitive, primitiveContext(request, orchestratorId))));
}
async function handleStrategy({ db, request, orchestratorId }) {
  const transition = await strategyAdaptation.changeStrategy(db, {
    orchestratorId, need: request.need || request.strategy, reason: request.reason,
    problemProfile: request.problem_profile, maxCostLevel: request.max_cost_level,
    allowExperimental: request.allow_experimental, allowPrototype: request.allow_prototype,
    allowExperimentalAtHighRisk: request.allow_experimental_at_high_risk,
    executionBudget: request.execution_budget
  });
  telemetry.emitEvent({
    eventType: transition.changed ? 'STRATEGY_CHANGED' : 'STRATEGY_RETAINED', agentId: orchestratorId,
    action: transition.changed ? 'RESELECT_STRATEGY' : 'KEEP_STRATEGY',
    detail: transition.changed ? `Changed primary strategy from '${transition.previous.primary}' to '${transition.current.primary}'.` : transition.reason,
    payload: transition, severity: 'info'
  });
  process.stdout.write(JSON.stringify(transition));
}
async function handleOrganizationChange({ db, request, orchestratorId }) {
  const transition = await dynamicOrganization.changeOrganization(db, {
    orchestratorId, organization: request.organization || request.topology, reason: request.reason,
    changedBy: process.env.GENOS_AGENT_ID || orchestratorId
  });
  if (transition.changed) telemetry.emitEvent({
    eventType: 'ORGANIZATION_CHANGED', agentId: orchestratorId, action: 'REORGANIZE',
    detail: `Changed organization from '${transition.previous || 'none'}' to '${transition.organization}'.`,
    payload: transition, severity: 'info'
  });
  process.stdout.write(JSON.stringify(transition));
}
async function handleOrganizationPublish({ db, request, orchestratorId }) {
  const senderAgentId = process.env.GENOS_AGENT_ID || request.senderAgentId || orchestratorId;
  const published = await dynamicOrganization.publish(db, {
    orchestratorId, senderAgentId, recipientAgentId: request.recipientAgentId || request.recipient_agent_id,
    kind: request.kind, content: request.content, payload: request.payload,
    signalType: request.signalType || request.signal_type,
    signalData: request.signalData || request.signal_data || request.signal
  });
  telemetry.emitEvent({
    eventType: published.delivery === 'buffered' ? 'ORGANIZATION_MESSAGE_BUFFERED' : 'ORGANIZATION_MESSAGE_PUBLISHED',
    agentId: senderAgentId, action: published.channel,
    detail: `Published ${published.kind} through ${published.organization}.`,
    payload: { ...published, sender: senderAgentId, recipient: published.recipientAgentId }, severity: 'info'
  });
  process.stdout.write(JSON.stringify(published));
}
async function handleOrganizationRead({ db, request, action, orchestratorId }) {
  const requesterAgentId = process.env.GENOS_AGENT_ID || request.requesterAgentId || orchestratorId;
  const result = action === 'organization_state'
    ? await dynamicOrganization.getStateForMember(db, orchestratorId, requesterAgentId)
    : await dynamicOrganization.inbox(db, { orchestratorId, requesterAgentId, afterId: request.after_id, limit: request.limit });
  process.stdout.write(JSON.stringify(result || { orchestratorId, organization: 'specialist_expert_committee', version: 0 }));
}
async function ensureParent({ db, context }) {
  let parent = await db.get("SELECT a.id, a.status, a.is_apoptotic, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'", context.orchestratorId);
  if (parent && (parent.is_apoptotic || ['apoptosis', 'completed', 'terminated', 'error', 'failed', 'unverified', 'quarantined'].includes(parent.status))) {
    context.orchestratorId = createOrchestratorId('mcp_orchestrator');
    await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
      VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, context.orchestratorId, context.task);
    parent = await db.get("SELECT a.id, a.status, a.is_apoptotic, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'", context.orchestratorId);
  }
  if (!parent) throw new Error(`Orchestrator '${context.orchestratorId}' was not found.`);
  if (!await contracts.getLatestContract(db, context.orchestratorId)) await contracts.saveContract(db, {
    agentId: context.orchestratorId, problem: context.task, createdBy: 'mcp_' + context.action
  });
  return parent;
}
function workerLaunchPayload(args) {
  return require('./workerLaunchPayload.cjs').workerLaunchPayload(args);
}

async function ensureWorkerNceEnrichments(context) {
  if (context.nceEnrichments) return context.nceEnrichments;
  const topologyNCE = require('../src/services/topologyNCEService');
  context.nceEnrichments = await topologyNCE.computeNCEForTopology(
    context.task,
    topologyNCE.buildTopologyOptions(context, 'worker')
  );
  return context.nceEnrichments;
}
function launchWorker({ context, member, index, parent, suppliedWorkerId }) {
  const workerId = suppliedWorkerId || createOrchestratorId(`worker_${context.orchestratorId}_${index}`);
  const runner = spawn(process.execPath, [context.bridgePath, JSON.stringify(workerLaunchPayload({ context, member, workerId, parent }))], { cwd: context.repoRoot, detached: true, stdio: getRunnerStdio(workerId) });
  runner.unref();
  return { workerId, subSystem: member.subSystem, memberNumber: member.memberNumber || index, role: member.role, modelTier: member.modelTier, status: 'accepted' };
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

async function handleTeam(opts) {
  const handlers = require('../bin/topologyHandlers.cjs');
  return handlers.handleTeam(opts.db, opts.context);
}

async function handleBiological(opts) {
  const handlers = require('../bin/topologyHandlers.cjs');
  return handlers.handleBiological(opts.db, opts.context);
}

async function handleTrinity(opts) {
  const handlers = require('../bin/topologyHandlers.cjs');
  return handlers.handleTrinity(opts.db, opts.context);
}
async function selectWorker({ db, context }) {
  const { request } = context;
  let reusable = null;
  if (request.reuseWorkerId) {
    const selected = await db.get(`SELECT id, name, role, about, model_tier as modelTier, language, isolation_mode as isolationMode FROM agents WHERE id = ? AND parent_agent_id = ? AND execution_mode = 'worker' AND status = 'idle'`, request.reuseWorkerId, context.orchestratorId);
    const affinity = workerGarage.reuseAffinity(selected, { mission: context.task, role: String(request.role || 'implementation') });
    if (!affinity) throw new Error(`Selected worker '${request.reuseWorkerId}' is no longer idle or the mission is outside its scope.`);
    reusable = { ...selected, affinity }; context.id = selected.id;
  } else if (request.reuseChecked !== true) {
    reusable = await workerGarage.findReusableWorker(db, context.orchestratorId, { mission: context.task, role: String(request.role || 'implementation') });
    if (reusable) context.id = reusable.id;
  }
  context.reusedWorker = Boolean(reusable);
  return reusable;
}
async function prepareWorker({ db, context, parent, reusable }) {
  const { request } = context;
  const role = workerRole(request);
  await workerGarage.requireAvailableSlot(db, context.orchestratorId, workerSlotId(context));
  const name = workerName(request, role, context.task);
  const sourceWorkspace = workspaceFor(parent, context);
  validateWorkspace(request.workspace_root, sourceWorkspace);
  const workspaceRoot = await runtime.createIsolatedWorkspace(sourceWorkspace, workerCapsuleId(context), path.dirname(sourceWorkspace));
  await insertWorker({ db, context, parent, request, name, role });
  return { name, role, workspaceRoot };
}
function workerRole(request) { return String(request.role || 'implementation'); }
function workerSlotId(context) { return context.reusedWorker ? context.id : null; }
function workerName(request, role, mission) { return String(request.name || workerGarage.workerName({ role, mission })); }
function workspaceFor(parent, context) { return parent.workspace_root || process.env.GENOS_WORKSPACE_ROOT || context.repoRoot; }
function workerCapsuleId(context) { return context.reusedWorker ? `${context.id}_run_${Date.now()}` : context.id; }
function sameWorkspacePath(left, right) {
  return process.platform === 'win32'
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}
function validateWorkspace(requested, source) {
  const norm = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (requested && norm(requested) !== norm(source)) throw new Error(`Requested workspace root does not match orchestrator workspace '${source}'.`);
}
async function insertWorker({ db, context, parent, request, name, role }) {
  if (context.reusedWorker) return;
  await db.run(`INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task) VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'garage_delegation', ?, ?)`, context.id, name, role, parent.agent_type || 'GenOS', parent.workspace_id || null, parent.fleet_id || null, request.model_tier || parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', context.orchestratorId, `Worker scope: ${context.task}`, context.task);
}
async function startWorker({ db, context, parent, reusable, worker }) {
  context.delegatedWorkerId = context.id; const garage = await workerGarage.reserveSlot(db, { orchestratorId: context.orchestratorId, workerId: context.id, name: worker.name, role: worker.role, mission: context.task });
  try { await startWorkerMission({ db, context, parent, reusable, worker }); } catch (error) {
    await workerGarage.releaseSlot(db, { orchestratorId: context.orchestratorId, workerId: context.id }); throw error;
  }
  const agents = await context.waitForCompletion(db);
  process.stdout.write(JSON.stringify({ orchestratorId: context.orchestratorId, workerId: context.id, workerName: worker.name, reusedWorker: context.reusedWorker, ...(reusable?.affinity ? { matchedScope: reusable.affinity.shared } : {}), garage: { slot: garage.slot, capacity: garage.capacity }, agents }));
}
async function startWorkerMission({ db, context, parent, reusable, worker }) {
  const strategyContract = await contracts.getLatestContract(db, context.orchestratorId);
  if (!strategyContract) throw new Error(`No strategy contract is available for orchestrator '${context.orchestratorId}'.`);
  const missionBudget = { ...(context.request.execution_budget || context.request.executionBudget || {}) };
  if (context.request.timeoutMs && !missionBudget.latencyMs) {
    missionBudget.latencyMs = Math.max(1000, Number(context.request.timeoutMs) - 4000);
  }
  const workerPrompt = aTeamService.dependencyPrompt(context.task, context.request.depends_on);

  // Enrichissement NCE pour le worker direct (même mécanisme que les topologies)
  await ensureWorkerNceEnrichments(context).catch(() => {});
  const localRuntime = requestLocalRuntime(context.request);
  const workerLaunch = workerLaunchPayload({ db, context, member: { mission: workerPrompt, role: worker.role, modelTier: parent.model_tier }, workerId: context.id, parent });
  await dispatchWorkerMission({ agentId: context.id, name: worker.name, role: worker.role, prompt: workerLaunch.mission, modelTier: firstValue(context.request.model_tier, reusable?.modelTier, parent.model_tier), workspaceRoot: worker.workspaceRoot, workspaceIsolation: parent.isolation_mode, workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type, orchestratorAgentId: context.orchestratorId, strategyContract: strategyContract.contract, executionBudget: missionBudget, executionPolicy: workerPolicy(context.request), toolLease: runtime.workerToolLease(worker.role), timeoutMs: context.request.timeoutMs, localRuntime });
}
function requestLocalRuntime(request = {}) {
  if (request.localRuntime === true) return true;
  return String(request.executor || request.runtime || '').trim().toLowerCase() === 'local';
}
function workerPolicy(request = {}) {
  const policy = request.executionPolicy || {};
  const explicitCommands = firstPresent(request.allowed_commands, request.allowedCommands, policy.allowedCommands);
  const explicitEdits = firstPresent(request.allow_file_edits, request.allowFileEdits, policy.allowFileEdits);
  let inherited;
  if (explicitCommands !== undefined) inherited = normalizeAllowedCommands(explicitCommands) || [];
  else { try { inherited = normalizeAllowedCommands(JSON.parse(process.env.GENOS_ALLOWED_COMMANDS_JSON || '[]')) || []; } catch { inherited = []; } }
  return { allowedCommands: inherited, allowFileEdits: explicitEdits === undefined ? /^(1|true)$/i.test(String(process.env.GENOS_ALLOW_FILE_EDITS || '')) : explicitEdits === true, silentUpdates: /^(1|true)$/i.test(String(process.env.GENOS_SILENT_UPDATES || '')) };
}
async function handleWorker({ db, context }) {
  const parent = await db.get(`SELECT a.id, a.name, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'`, context.orchestratorId);
  if (!parent) throw new Error(`Orchestrator '${context.orchestratorId}' was not found.`);
  const reusable = await selectWorker({ db, context });
  const worker = await prepareWorker({ db, context, parent, reusable });
  await startWorker({ db, context, parent, reusable, worker });
}
async function handleTrinityMerge({ db, context }) {
  const { request, orchestratorId } = context;
  const missionId = request.missionId || request.mission_id;
  let worldReports = request.worldReports || request.world_reports || [];
  if (!worldReports.length && missionId) {
    worldReports = await trinityComparativeBarrier.buildWorldReportsFromMission(db, missionId);
  }
  const domain = request.domain || 'software_engineering';
  const threshold = typeof request.threshold === 'number' ? request.threshold : 0.70;
  const result = trinityService.mergeTrinityEvidence(worldReports, { domain, threshold });
  await trinityService.recordWorldComparison(db, {
    missionId,
    orchestratorId,
    comparison: result.comparativeAnalysis,
    decision: { canMerge: result.canMerge, threshold }
  });
  const promotion = await trinityComparativeBarrier.promoteWinner(db, { missionId, orchestratorId, result });
  process.stdout.write(JSON.stringify({
    orchestratorId,
    trinityMerge: result,
    promotion
  }));
}
const HANDLERS = {
  report_progress: handleReportProgress,
  execute_primitive: handlePrimitive,
  change_strategy: handleStrategy,
  change_organization: handleOrganizationChange,
  organization_publish: handleOrganizationPublish,
  organization_inbox: handleOrganizationRead,
  organization_state: handleOrganizationRead,
  dispatch_trinity: handleTrinity,
  merge_trinity: handleTrinityMerge,
  compare_trinity: handleTrinityMerge,
  dispatch_team: handleTeam,
  dispatch_biological: handleBiological,
  dispatch_worker: handleWorker,
  ontology: handleOntologyRequest,
  philosophy: handlePhilosophyRequest
};
async function handleAction(context) {
  const handler = HANDLERS[context.action];
  if (!handler) return false;
  await handler({ ...context, context });
  return true;
}
if (require.main === module) require('./orchestratorActionsCli.cjs').run({ handleAction }).catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { handleAction, handleBackground, initializeMission, workerLaunchPayload };
