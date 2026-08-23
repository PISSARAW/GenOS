/**
 * Provider-neutral bridge between Studio deployments and a real GenOS agent runtime.
 * The configured executable receives one framed protobuf mission on stdin and emits framed
 * protobuf events on stdout. Each event is forwarded to the Studio telemetry bus and agent state.
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const fsSync = require('fs');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const strategyExecution = require('./strategyExecutionService');
const strategyContracts = require('./strategyContractService');
const { encodeMission, decodeEvents } = require('./runtimeProtocol');
const agentAuthority = require('./agentAuthorityService');
const { buildAutonomyPlan } = require('./autonomousOrchestrationService');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');
const { decideFromEvent } = require('./orchestrationDecisionService');
const actionExecutor = require('./orchestrationActionExecutor');
const localCodeWorker = require('./localCodeWorkerService');
const hallucinationMonitor = require('./hallucinationMonitoringService');
const resilienceService = require('./resilienceService');
const { buildAllocation, selectSurvivors } = require('./tokenAllocationService');
const agentCapsules = require('./agentCapsuleService');
const workerGarage = require('./workerGarageService');
const aTeamService = require('./aTeamService');
const trinityService = require('./trinityService');
const workerRecovery = require('./workerFailureRecoveryService');
const dynamicOrganization = require('./dynamicOrganizationService');
const userProgress = require('./userProgressService');

const activeProcesses = new Map();
const missionStarts = new Map();
const pendingContinuations = new Map();
const autonomousRounds = new Map();
const pendingWorkerRecoveries = new Map();

function bundledRuntimeEnvironment() {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  return {
    GENOS_BIN: process.env.GENOS_BIN || path.join(repositoryRoot, 'target/debug/genos'),
    GENOS_MCP_BIN: process.env.GENOS_MCP_BIN || path.join(repositoryRoot, 'target/debug/genos-mcp'),
    GENOS_ORCHESTRATOR_BRIDGE: process.env.GENOS_ORCHESTRATOR_BRIDGE || path.join(repositoryRoot, 'backend/bin/genos-orchestrate.cjs')
  };
}

function configuredExecutable() {
  const configured = String(process.env.GENOS_AGENT_EXECUTOR || '').trim();
  if (configured) return configured;

  // The bundled bridge is the supported local default. Keeping this fallback
  // here makes every launch path (npm, Studio, or an API test) behave the same
  // without requiring a separately managed environment file.
  return path.resolve(__dirname, '../../bin/genos-agent-runtime.cjs');
}

function runtimeAvailability() {
  const executable = configuredExecutable();
  if (path.isAbsolute(executable) && !fsSync.existsSync(executable)) {
    return { available: false, reason: `Agent executor was not found: ${executable}` };
  }
  if (path.basename(executable) !== 'genos-agent-runtime.cjs') return { available: true };
  const codex = process.env.CODEX_EXECUTABLE || 'codex';
  const probe = spawnSync(codex, ['--version'], { stdio: 'ignore', timeout: 3000 });
  if (probe.status !== 0) return { available: false, reason: `Codex executor is unavailable: ${codex}` };
  const runtime = bundledRuntimeEnvironment();
  const missing = [runtime.GENOS_BIN, runtime.GENOS_MCP_BIN].filter((file) => !fsSync.existsSync(file));
  if (missing.length) {
    return { available: false, reason: `GenOS runtime binaries are unavailable: ${missing.join(', ')}. Build genos-cli and genos-mcp first.` };
  }
  return { available: true };
}

function resolveExecutable(executable, workspaceRoot) {
  // Keep PATH commands (for example, `node`) intact, but make local scripts
  // independent of whether the backend was launched from backend/ or the repo root.
  if (!path.isAbsolute(executable) && executable.includes(path.sep)) return path.resolve(workspaceRoot, executable);
  return executable;
}

function emit(agentId, eventType, action, detail, payload = {}, severity = 'info', status) {
  return telemetry.emitEvent({ eventType, agentId, action, detail, payload, severity, status });
}

async function updateAgent(agentId, status, currentTask) {
  const db = await getDatabase();
  await db.run(
    'UPDATE agents SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    status || null, currentTask || null, agentId
  );
}

function runtimeExitOutcome(termination, code, signal, stderr = '') {
  if (termination) {
    return {
      status: 'blocked', eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning',
      task: `Runtime halted: ${termination.reason}`,
      detail: `Runtime halted by ${termination.kind}: ${termination.reason}`,
      payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason, stderr: String(stderr).trim() }
    };
  }
  if (code === 0) {
    return {
      status: 'idle', eventType: 'AGENT_COMPLETED', action: 'COMPLETE', severity: 'info', task: 'Execution completed',
      detail: 'Runtime completed successfully.', payload: { code }
    };
  }
  const lastError = String(stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  return {
    status: 'error', eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error',
    task: `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
    detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`,
    payload: { code, signal, stderr: String(stderr).trim() }
  };
}

function autonomousWorkerId(orchestratorId, index) {
  return `worker_${orchestratorId}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
}

function evidenceScore(payload = {}) { const report = payload.evidenceReport || payload.report || {}; const claims = Array.isArray(report.claims) ? report.claims : []; return claims.reduce((count, claim) => count + (Array.isArray(claim.evidence) ? claim.evidence.length * 10 : 0), 0) + claims.length * 2 - (Array.isArray(report.uncertainties) ? report.uncertainties.length * 3 : 0); }
async function advanceAutonomousRound(mission, event) {
  const round = mission.budgetRound;
  if (round?.stage !== 'initial' || !['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR'].includes(event.eventType)) return;
  const state = autonomousRounds.get(round.orchestratorId);
  if (!state || state.advanced || !state.workerIds.has(mission.agentId)) return;
  state.results.set(mission.agentId, {
    agentId: mission.agentId,
    status: event.eventType === 'AGENT_COMPLETED' ? 'completed' : 'failed',
    evidenceScore: evidenceScore(event.payload),
    payload: event.payload || {}
  });
  if (state.results.size < state.workerIds.size) return;
  state.advanced = true;
  const continuation = state.plan.tokenPolicy.rounds?.continuation;
  const survivors = selectSurvivors(
    [...state.results.values()].filter((result) => result.status === 'completed'),
    continuation?.survivorCount
  );
  emit(round.orchestratorId, 'TOKEN_ROUND_EVALUATED', 'SUCCESSIVE_HALVING', `Initial screening selected ${survivors.length} of ${state.workerIds.size} branches.`, { allocation: state.plan.tokenPolicy.allocation, initial: state.plan.tokenPolicy.rounds.initial, continuation, survivors: survivors.map(({ agentId, evidenceScore: score }) => ({ agentId, evidenceScore: score })) }, 'info');
  for (const survivor of survivors) {
    const previous = state.workers.get(survivor.agentId);
    const dossier = JSON.stringify(survivor.payload.evidenceReport || {}).slice(0, 8000);
    pendingContinuations.set(survivor.agentId, {
      ...previous,
      prompt: `${previous.prompt}\n\nBudget round: continuation. You were selected after evidence scoring. Use the remaining ${continuation.perWorkerTokens} tokens only to resolve the highest-value uncertainty and return a final evidence report. Initial dossier:\n${dossier}`,
      executionBudget: { ...previous.executionBudget, tokens: continuation.perWorkerTokens },
      budgetRound: { stage: 'continuation', orchestratorId: round.orchestratorId }
    });
  }
  autonomousRounds.delete(round.orchestratorId);
}

function dispatchPendingContinuation(agentId) {
  if (activeProcesses.has(agentId) || missionStarts.has(agentId)) return;
  const mission = pendingContinuations.get(agentId);
  if (!mission) return;
  pendingContinuations.delete(agentId);
  startMission(mission).catch((error) => emit(mission.orchestratorAgentId || agentId, 'TOKEN_ROUND_DISPATCH_FAILED', 'SUCCESSIVE_HALVING', error.message, { workerId: agentId }, 'error'));
}

async function applyOrganizationDecision(orchestratorId, organization, reason) {
  if (!orchestratorId || !dynamicOrganization.organizationProfile(organization)) return null;
  const db = await getDatabase();
  const transition = await dynamicOrganization.changeOrganization(db, {
    orchestratorId, organization, reason, changedBy: orchestratorId
  });
  if (transition.changed) {
    emit(orchestratorId, 'ORGANIZATION_CHANGED', 'REORGANIZE', `Changed organization from '${transition.previous || 'none'}' to '${transition.organization}'.`, transition, 'info');
  }
  return transition;
}

function queueWorkerRecovery(mission, event) {
  const workerId = mission.agentId || mission.id;
  if (pendingWorkerRecoveries.has(workerId)) {
    const pending = pendingWorkerRecoveries.get(workerId);
    return { report: pending.report, decision: pending.decision, queued: false, duplicate: true };
  }
  const report = workerRecovery.failureReport(event, mission);
  const decision = workerRecovery.decideRecovery(report);
  const orchestratorId = mission.orchestratorAgentId;
  if (!orchestratorId) return { report, decision, queued: false };
  emit(orchestratorId, 'WORKER_FAILURE_REPORTED', 'ANALYZE_FAILURE', `Worker '${report.workerId}' reported that it could not complete its mission.`, { report }, 'warning');
  emit(orchestratorId, 'WORKER_RECOVERY_DECISION', decision.action, decision.reason, {
    workerId: report.workerId, report, decision
  }, decision.terminal && decision.action !== 'conclude_no_answer' ? 'warning' : 'info');
  const recoveryOrganization = decision.action === 'mutate_worker'
    ? 'isolated_recovery'
    : decision.action === 'fork_worker' ? 'competitive_arena'
      : decision.action === 'replace_worker' ? 'specialist_expert_committee' : null;
  if (recoveryOrganization) applyOrganizationDecision(orchestratorId, recoveryOrganization, decision.reason).catch(() => {});
  if (decision.retry && !pendingWorkerRecoveries.has(report.workerId)) {
    pendingWorkerRecoveries.set(report.workerId, { mission, report, decision });
    return { report, decision, queued: true };
  }
  if (decision.action === 'conclude_no_answer') {
    emit(orchestratorId, 'WORKER_NO_ANSWER_ACCEPTED', 'CONCLUDE_NO_ANSWER', 'The orchestrator accepted the worker proof that no answer exists in the stated scope.', {
      workerId: report.workerId, proof: report.noAnswerProof
    }, 'info');
  } else if (decision.action === 'escalate_unresolved') {
    emit(orchestratorId, 'WORKER_RECOVERY_EXHAUSTED', 'ESCALATE', decision.reason, { workerId: report.workerId, report }, 'warning');
  }
  return { report, decision, queued: false };
}

function workerToolLease(role) {
  const lease = ['genos_search_failures', 'genos_diagnose', 'genos_hypothesis_evidence', 'genos_snapshot', 'genos_run', 'genos_diff', 'genos_evaluate_trajectories', 'genos_record_experience', 'genos_replay', 'genos_organization_state', 'genos_worker_publish', 'genos_worker_inbox'];
  if (/reviewer|observer/i.test(role || '')) lease.push('genos_adversarial_review');
  if (/red_team|blue_team/i.test(role || '')) lease.push('genos_security_coevolution');
  return lease;
}

function orchestratorToolLease(plan = {}) {
  const core = [
    'genos_search_failures', 'genos_diagnose', 'genos_hypothesis_evidence',
    'genos_snapshot', 'genos_fork', 'genos_create', 'genos_solve', 'genos_run',
    'genos_diff', 'genos_evaluate_trajectories', 'genos_merge',
    'genos_record_experience', 'genos_record_decision', 'genos_replay',
    'genos_adversarial_review', 'genos_compile_memory',
    'genos_resilience_hypermutation', 'genos_security_coevolution',
    'genos_parasitic_pressure', 'genos_delegate_worker', 'genos_a_team_preview',
    'genos_trinity_launch', 'genos_change_strategy', 'genos_change_organization', 'genos_organization_state',
    'genos_worker_publish', 'genos_worker_inbox', 'genos_report_progress'
  ];
  return [...new Set([...core, ...(plan.requiredTools || [])])]
    .filter((tool) => tool !== 'genos_orchestrate');
}

function runCommand(command, args, { cwd, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`)));
    child.stdin.end(input || '');
  });
}

async function availableBytes(directory) {
  const stats = await fs.statfs(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

async function createIsolatedWorkspace(sourceRoot, workerId, capsuleRootOverride) {
  const source = path.resolve(sourceRoot);
  // Keep capsules beside (not inside) the source workspace: fs.cp rejects a
  // destination nested under its source and this also keeps the parent clean.
  const capsuleRoot = capsuleRootOverride || process.env.GENOS_CAPSULE_ROOT || path.join(path.dirname(source), '.genos-agent-worlds');
  // An explicit root is already the mission capsule directory. Workers must
  // be its siblings: nesting them below the orchestrator source makes fs.cp
  // recursively copy a directory into itself for non-Git workspaces.
  const destination = capsuleRootOverride
    ? path.join(capsuleRoot, workerId)
    : path.join(capsuleRoot, path.basename(source), workerId);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  // Git worktrees share the object database and prevent a multi-gigabyte copy
  // of dependencies. Replay the tracked dirty diff so the capsule starts from
  // the caller's real working state without altering that source workspace.
  try {
    await runCommand('git', ['rev-parse', '--is-inside-work-tree'], { cwd: source });
    const { stdout: diff } = await runCommand('git', ['diff', '--binary'], { cwd: source });
    await runCommand('git', ['worktree', 'add', '--detach', destination, 'HEAD'], { cwd: source });
    if (diff) await runCommand('git', ['apply', '--whitespace=nowarn', '-'], { cwd: destination, input: diff });
    return destination;
  } catch (gitError) {
    // Non-Git workspaces retain the copy fallback below. A partially created
    // worktree is deliberately surfaced instead of silently copying into it.
    const destinationExists = await fs.access(destination).then(() => true, () => false);
    if (destinationExists) throw gitError;
  }
  // Capsules must never recursively copy previous capsules, build products, or
  // VCS metadata. They remain on disk for replay and evidence-aware merging.
  if (await availableBytes(path.dirname(destination)) < 1024 * 1024 * 1024) {
    throw new Error('Insufficient disk space for a non-Git isolated workspace; free at least 1 GiB or use a Git workspace.');
  }
  const excluded = new Set(['.git', '.genos', 'node_modules', 'target']);
  await fs.cp(source, destination, {
    recursive: true,
    filter: (entry) => !excluded.has(path.basename(entry))
  });
  return destination;
}

async function dispatchWorkerRecovery(sourceAgentId) {
  const recovery = pendingWorkerRecoveries.get(sourceAgentId);
  if (!recovery) return false;
  pendingWorkerRecoveries.delete(sourceAgentId);
  pendingContinuations.delete(sourceAgentId);
  const { mission, report, decision } = recovery;
  const db = await getDatabase();
  const source = await db.get(
    `SELECT id, name, role, agent_type, workspace_id, fleet_id, model_tier, language,
            isolation_mode, parent_agent_id
     FROM agents WHERE id = ? AND execution_mode = 'worker'`,
    sourceAgentId
  );
  if (!source?.parent_agent_id) return false;
  const orchestratorId = source.parent_agent_id;
  const sameIdentity = decision.identity === 'same';
  const targetId = sameIdentity
    ? sourceAgentId
    : `worker_${orchestratorId}_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const role = decision.role || source.role || mission.role || 'recovery_specialist';
  const prompt = workerRecovery.recoveryPrompt(report, decision);
  const name = workerGarage.workerName({ role, mission: `${decision.action}: ${report.mission}` });
  let workspaceRoot;
  try {
    await workerGarage.requireAvailableSlot(db, orchestratorId);
    const sourceRoot = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
    workspaceRoot = await createIsolatedWorkspace(
      sourceRoot,
      `${targetId}_${decision.action}_${report.attempt + 1}`,
      path.dirname(sourceRoot)
    );
    if (sameIdentity) {
      await db.run("UPDATE agents SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?", targetId);
    } else {
      await db.run(
        `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id,
          model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
         VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        targetId, name, role, source.agent_type || 'GenOS', source.workspace_id || null, source.fleet_id || null,
        source.model_tier || mission.modelTier || 'standard', source.language || 'TypeScript', source.isolation_mode || 'Branch',
        orchestratorId, decision.action, `Recovery scope: ${report.mission}`, prompt
      );
    }
    const garage = await workerGarage.reserveSlot(db, { orchestratorId, workerId: targetId, name, role, mission: prompt });
    emit(orchestratorId, 'WORKER_RECOVERY_DISPATCHED', decision.action, `Dispatched ${decision.action} as '${name}'.`, {
      sourceWorkerId: sourceAgentId, workerId: targetId, attempt: report.attempt + 1,
      slot: garage.slot, capacity: garage.capacity, decision
    }, 'info');
    await startMission({
      ...mission,
      agentId: targetId,
      name,
      role,
      prompt,
      originalMission: report.mission,
      recoveryAttempt: report.attempt + 1,
      recoveryMaxAttempts: report.maxAttempts,
      recoveryHistory: [...(mission.recoveryHistory || []), { workerId: sourceAgentId, report, decision }],
      workspaceRoot,
      workspaceProvisioned: true,
      orchestratorAgentId: orchestratorId,
      budgetRound: undefined,
      localModel: decision.action === 'replace_worker' ? undefined : mission.localModel,
      localRoutingPolicy: decision.action === 'replace_worker' ? undefined : mission.localRoutingPolicy,
      disableLocalModel: decision.action === 'replace_worker',
      toolLease: workerToolLease(role),
      autonomousOrchestration: false
    });
    return true;
  } catch (error) {
    await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, targetId).catch(() => {});
    emit(orchestratorId, 'WORKER_RECOVERY_DISPATCH_FAILED', decision.action, error.message, {
      sourceWorkerId: sourceAgentId, workerId: targetId, attempt: report.attempt + 1
    }, 'error');
    return false;
  }
}

async function provisionMissionWorkspace(mission, executionMode) {
  // An orchestrator is the authority boundary for a mission and must never
  // operate directly in the caller's workspace. Workers already receive a
  // capsule from their orchestrator, so preserve their assigned root.
  if (executionMode !== 'orchestrator' || mission.workspaceProvisioned === true) return mission;
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, mission.agentId);
  return { ...mission, workspaceRoot, capsuleRoot: path.dirname(workspaceRoot) };
}

async function consultLocalModels(db, agentId, mission, plan, tenant = {}) {
  const candidates = await localModelDiscovery.discoverChatModelUris();
  if (!candidates.length) return { consulted: false, candidates: [] };
  try {
    const policy = await modelRouter.localRoutingPolicy(db, { agentId, ...tenant }, candidates);
    const result = await modelRouter.generate({
      db, agentId, ...tenant, timeoutMs: 15000, policy,
      prompt: `You are the local planning model for a GenOS orchestrator. Analyse this mission and return a concise JSON-like recommendation: which hypotheses merit forks, which worker roles are needed, when replay/merge is justified, and what can be delegated locally. Mission: ${mission.prompt || mission.currentTask || ''}. Strategy profile: ${JSON.stringify(plan.profile)}.`
    });
    return { consulted: true, candidates, selectedModel: result.model, provider: result.provider, advice: String(result.text || '').slice(0, 4000), route: result.route, policy };
  } catch (error) {
    return { consulted: false, candidates, error: error.message };
  }
}

function modelScale(model) {
  const billions = String(model.model || '').match(/(?:^|[-_:])(\d+(?:\.\d+)?)b(?:$|[-_:])/i);
  if (billions) return Number(billions[1]) * 1_000_000_000;
  return Number(model.size || 0);
}

function rankLocalModels(models, modelTier) {
  const tier = String(modelTier || '').toLowerCase();
  if (!/(flash|pro|frontier)/.test(tier)) return models;
  const direction = /pro|frontier/.test(tier) ? -1 : 1;
  return [...models].sort((left, right) => direction * (modelScale(left) - modelScale(right)));
}

async function localWorkerRoute(db, agentId, role, modelTier, tenant = {}) {
  const cpuCount = os.cpus().length;
  const load = os.loadavg()[0];
  const freeMemoryRatio = os.freemem() / os.totalmem();
  const models = await localModelDiscovery.discoverLocalModels();
  const localCodeEnabled = process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1';
  const reviewRole = /reviewer|observer|red_team|blue_team/i.test(role || '');
  const implementationRole = /implementation|coder|developer/i.test(role || '');
  const eligible = (reviewRole || (localCodeEnabled && implementationRole)) && cpuCount >= 4 && load < cpuCount * 0.8 && freeMemoryRatio >= 0.15;
  const chatModels = models.filter((model) => model.chatCapable);
  const policy = await modelRouter.localRoutingPolicy(db, { agentId, ...tenant }, chatModels.map((model) => model.uri));
  const orderedUris = policy.configured
    ? modelRouter.candidateModels(null, policy)
    : rankLocalModels(chatModels, modelTier).map((model) => model.uri);
  const selected = eligible ? orderedUris[0] : null;
  return {
    selectedModel: selected || null,
    policy: { ...policy, primary: selected || policy.primary, fallbacks: orderedUris.filter((uri) => uri !== selected) },
    criteria: { cpuCount, load1m: load, freeMemoryRatio: Number(freeMemoryRatio.toFixed(3)), role, modelTier, eligible, discoveredModels: models.map((model) => model.uri), orderedModels: orderedUris }
  };
}

async function runLocalWorker(db, mission, executionRun) {
  await updateAgent(mission.agentId, 'running', mission.prompt);
  const started = emit(mission.agentId, 'LOCAL_WORKER_STARTED', 'LOCAL_MODEL', `Started local-model worker with ${mission.localModel}.`, { model: mission.localModel, criteria: mission.localRoutingCriteria }, 'info', 'running');
  await strategyExecution.recordExecutionEvent(db, mission.agentId, started);
  try {
    const codeWorker = process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1' && /implementation|coder|developer/i.test(mission.role || '');
    const result = await modelRouter.generate({
      db, agentId: mission.agentId, model: mission.localModel, timeoutMs: Number(mission.executionBudget?.latencyMs || 30000),
      policy: mission.localRoutingPolicy || { primary: mission.localModel, preferLocal: true },
      prompt: codeWorker
        ? `You are a bounded GenOS local code worker. Return only strict JSON {"format":"genos.file-replacement/v1","patches":[{"path":"relative/source/file","content":"complete replacement content"}],"tests":["cargo test --quiet"],"evidence":"brief proof"}. One or two allow-listed tests are mandatory. You may alter only source files, never tests, manifests, secrets, locks, or configuration. Your changes stay in the isolated capsule and are never merged automatically. Branch mission:\n${mission.prompt}`
        : `You are a bounded GenOS local worker. Do not modify files or spawn agents. Analyse this assigned branch, identify risks, tests, counterexamples, and evidence for the orchestrator. Branch mission:\n${mission.prompt}`
    });
    const proposal = codeWorker ? await localCodeWorker.executeProposal({ workspaceRoot: mission.workspaceRoot, text: result.text }) : null;
    await updateAgent(mission.agentId, 'idle', 'Local review completed');
    const completed = emit(mission.agentId, 'AGENT_COMPLETED', codeWorker ? 'LOCAL_CODE_PROPOSAL' : 'LOCAL_REVIEW', codeWorker ? 'Local worker produced a non-merged capsule diff and test evidence.' : 'Local-model worker completed its evidence review.', { executionRunId: executionRun.id, model: result.model, provider: result.provider, advice: result.text, proposal, usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens } }, 'info', 'idle');
    const milestone = userProgress.milestoneFromEvent(completed, { agentId: mission.agentId, agentName: mission.name, task: mission.prompt });
    if (milestone) userProgress.report({ orchestratorId: mission.orchestratorAgentId || mission.agentId, sourceAgentId: mission.agentId, ...milestone, silent: mission.executionPolicy?.silentUpdates === true });
    await strategyExecution.recordExecutionEvent(db, mission.agentId, completed);
    await advanceAutonomousRound(mission, completed);
    const decision = decideFromEvent(completed);
    if (decision) {
      const ownerId = mission.orchestratorAgentId || mission.agentId;
      emit(ownerId, 'ORCHESTRATION_DECISION', decision.action, decision.reason, { sourceAgentId: mission.agentId, sourceEvent: completed.eventType, ...decision }, 'info');
      actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: mission.agentId, decision, event: completed, workspaceRoot: mission.workspaceRoot }).catch(() => {});
    }
    return { started: true, executionRun, local: true, result };
  } catch (error) {
    await updateAgent(mission.agentId, 'error', error.message);
    const failed = emit(mission.agentId, 'AGENT_FAILED', 'LOCAL_MODEL', error.message, { executionRunId: executionRun.id, model: mission.localModel }, 'warning', 'error');
    const milestone = userProgress.milestoneFromEvent(failed, { agentId: mission.agentId, agentName: mission.name, task: mission.prompt });
    if (milestone) userProgress.report({ orchestratorId: mission.orchestratorAgentId || mission.agentId, sourceAgentId: mission.agentId, ...milestone, silent: mission.executionPolicy?.silentUpdates === true });
    await strategyExecution.recordExecutionEvent(db, mission.agentId, failed);
    await advanceAutonomousRound(mission, failed);
    queueWorkerRecovery(mission, failed);
    return { started: false, executionRun, local: true, error: error.message };
  }
}

async function createAutonomousWorkers(db, orchestrator, plan, mission) {
  const assignments = plan.dispatchWorkers || [];
  if (!assignments.length) return [];
  const parent = await db.get(
    `SELECT a.id, a.name, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode, a.current_task,
            w.organization_id, w.project_id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`,
    orchestrator.id
  );
  if (!parent) throw new Error(`Orchestrator '${orchestrator.id}' disappeared before worker creation`);
  const initialRound = plan.tokenPolicy.rounds?.initial;
  const perWorkerTokens = Math.max(1, initialRound?.perWorkerTokens || Math.floor((plan.tokenPolicy.total * plan.tokenPolicy.workerShare) / assignments.length));
  const workers = [];
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  for (const [index, assignment] of assignments.entries()) {
    const id = autonomousWorkerId(orchestrator.id, index + 1);
    const name = workerGarage.workerName({ ...assignment, mission: mission.prompt });
    const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, id, mission.capsuleRoot);
    const localRoute = await localWorkerRoute(db, parent.id, assignment.role, assignment.modelTier || parent.model_tier, { organizationId: parent.organization_id, projectId: parent.project_id });
    const prompt = [mission.prompt || parent.current_task || 'Autonomous task execution', `Assigned branch: ${assignment.label}.`, `Hypothesis: ${assignment.hypothesis}`, plan.tokenPolicy.allocation === 'successive_halving_with_reallocation' ? `Budget round: initial screening. Use at most ${perWorkerTokens} tokens.` : `Budget allocation: ${perWorkerTokens} tokens.`].join('\n');
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
       VALUES (?, ?, ?, 'running', ?, 'worker', ?, ?, ?, ?, ?, ?, 'autonomous_strategy_branch', ?, ?)`,
      id, name, assignment.role, parent.agent_type || 'GenOS',
      parent.workspace_id || null, parent.fleet_id || null, localRoute.selectedModel || assignment.modelTier || parent.model_tier || 'standard',
      parent.language || 'TypeScript', parent.isolation_mode || 'Branch', parent.id,
      `Autonomous branch created by ${parent.name}. Budget round: initial; allocation: ${perWorkerTokens} tokens.`, prompt
    );
    workers.push({
      agentId: id, name, role: assignment.role, prompt,
      modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode,
      workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type,
      workspaceRoot, localModel: localRoute.selectedModel, localRoutingPolicy: localRoute.policy, localRoutingCriteria: localRoute.criteria, toolLease: workerToolLease(assignment.role),
      executionPolicy: mission.executionPolicy,
      executionBudget: { ...mission.executionBudget, tokens: perWorkerTokens }, orchestratorAgentId: parent.id, budgetRound: { stage: 'initial', orchestratorId: parent.id }
    });
  }
  return workers;
}

async function startMissionInternal(mission) {
  const agentId = mission.agentId || mission.id;
  const normalizedMission = { ...mission, agentId };
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const executable = configuredExecutable();
  const db = await getDatabase();
  const dispatchedAgent = await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId);
  const availability = runtimeAvailability();
  if (!availability.available) throw new Error(availability.reason);
  let contractRecord = await strategyContracts.getLatestContract(db, agentId);
  if (!contractRecord && normalizedMission.orchestratorAgentId) {
    contractRecord = await strategyContracts.getLatestContract(db, normalizedMission.orchestratorAgentId);
  }
  if (!contractRecord) throw new Error(`No strategy contract available for agent ${agentId}`);
  Object.assign(normalizedMission, await provisionMissionWorkspace(normalizedMission, dispatchedAgent.execution_mode));
  if (dispatchedAgent.execution_mode === 'worker' && !normalizedMission.localModel && normalizedMission.disableLocalModel !== true) {
    const workerTenant = normalizedMission.workspaceId
      ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
      : null;
    const route = await localWorkerRoute(db, agentId, normalizedMission.role, normalizedMission.modelTier, workerTenant || {});
    normalizedMission.localModel = route.selectedModel;
    normalizedMission.localRoutingPolicy = route.policy;
    normalizedMission.localRoutingCriteria = route.criteria;
  }
  const runtimeEnvironment = bundledRuntimeEnvironment();
  const genosCapsule = await agentCapsules.provision({
    executable: runtimeEnvironment.GENOS_BIN,
    workspaceRoot: normalizedMission.workspaceRoot,
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || agentId,
    role: normalizedMission.role || dispatchedAgent.role || 'GenOS agent',
    budgetSteps: normalizedMission.executionBudget?.events || 100
  });
  emit(agentId, 'AGENT_CAPSULE_CREATED', 'CAPSULE', `Created GenOS capsule ${genosCapsule.id}.`, genosCapsule, 'info');
  if (dispatchedAgent.execution_mode === 'orchestrator') {
    emit(agentId, 'ORCHESTRATOR_WORKSPACE_CREATED', 'CAPSULE', `Created isolated workspace for orchestrator ${agentId}.`, {
      workspaceRoot: normalizedMission.workspaceRoot
    }, 'info');
  }
  // Monitoring is automatic for every mission created by the orchestrator.
  // The counter is mission-scoped, so a previously resolved incident cannot
  // terminate a new mission.
  await db.run('UPDATE agents SET hallucination_monitoring = 1, hallucination_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', agentId);
  emit(agentId, 'HALLUCINATION_MONITORING_ENABLED', 'MONITOR', 'Evidence-bound hallucination monitoring enabled for this mission.', {}, 'info');
  const autonomyPlan = dispatchedAgent.execution_mode === 'orchestrator'
    ? buildAutonomyPlan(contractRecord.contract, normalizedMission.executionBudget)
    : null;
  if (autonomyPlan) {
    autonomyPlan.trinity = trinityService.analyzeMission(normalizedMission.prompt || normalizedMission.currentTask || '');
    const trinityWorkerCount = autonomyPlan.trinity.members.length;
    const affordableTrinityMembers = Math.floor(
      (autonomyPlan.tokenPolicy.total * 0.6) / autonomyPlan.tokenPolicy.minimumWorkerTokens
    );
    autonomyPlan.trinity.budgetPermitsLaunch = affordableTrinityMembers >= trinityWorkerCount;
    autonomyPlan.trinity.activated = autonomyPlan.trinity.explicitlyRequested && autonomyPlan.trinity.budgetPermitsLaunch;
    if (autonomyPlan.trinity.recommended && autonomyPlan.trinity.budgetPermitsLaunch) {
      autonomyPlan.tokenPolicy.workerShare = 0.6;
      autonomyPlan.tokenPolicy.orchestratorReserve = 0.4;
      autonomyPlan.tokenPolicy.rounds = buildAllocation({
        totalTokens: autonomyPlan.tokenPolicy.total,
        workerShare: autonomyPlan.tokenPolicy.workerShare,
        workerCount: trinityWorkerCount,
        minimumWorkerTokens: autonomyPlan.tokenPolicy.minimumWorkerTokens,
        mode: autonomyPlan.tokenPolicy.allocation
      });
      if (autonomyPlan.trinity.activated) {
        autonomyPlan.workers = autonomyPlan.trinity.members;
        autonomyPlan.dispatchWorkers = autonomyPlan.trinity.members;
        emit(agentId, 'TRINITY_PLANNED', 'COMPOSE_TRINITY', 'The mission explicitly requested Trinity; three evidence-comparison worlds were planned.', autonomyPlan.trinity, 'info');
      } else {
        autonomyPlan.workers = [];
        autonomyPlan.dispatchWorkers = [];
        emit(agentId, 'TRINITY_CONSIDERED', 'INTERVIEW_PLAN', 'The mission requests a user interview before planning; Trinity is available after the interview if three comparative worlds remain useful.', autonomyPlan.trinity, 'info');
      }
    } else if (autonomyPlan.trinity.recommended) {
      autonomyPlan.trinity.reason = `Trinity needs ${trinityWorkerCount} workers, but the token budget funds only ${affordableTrinityMembers}.`;
      emit(agentId, 'TRINITY_SKIPPED', 'BUDGET_GUARD', autonomyPlan.trinity.reason, autonomyPlan.trinity, 'warning');
    }
    autonomyPlan.aTeam = aTeamService.analyzeMission(normalizedMission.prompt || normalizedMission.currentTask || '');
    const aTeamWorkerCount = autonomyPlan.aTeam.members.length;
    const affordableAteamMembers = Math.floor(
      (autonomyPlan.tokenPolicy.total * 0.6) / autonomyPlan.tokenPolicy.minimumWorkerTokens
    );
    autonomyPlan.aTeam.activated = !autonomyPlan.trinity.recommended
      && autonomyPlan.aTeam.recommended
      && affordableAteamMembers >= aTeamWorkerCount;
    if (autonomyPlan.aTeam.activated) {
      autonomyPlan.workers = autonomyPlan.aTeam.members;
      autonomyPlan.dispatchWorkers = autonomyPlan.aTeam.members;
      autonomyPlan.tokenPolicy.workerShare = 0.6;
      autonomyPlan.tokenPolicy.orchestratorReserve = 0.4;
      autonomyPlan.tokenPolicy.rounds = buildAllocation({
        totalTokens: autonomyPlan.tokenPolicy.total,
        workerShare: autonomyPlan.tokenPolicy.workerShare,
        workerCount: aTeamWorkerCount,
        minimumWorkerTokens: autonomyPlan.tokenPolicy.minimumWorkerTokens,
        mode: autonomyPlan.tokenPolicy.allocation
      });
      emit(agentId, 'A_TEAM_PLANNED', 'COMPOSE_TEAM', `Detected multidisciplinary mission across ${autonomyPlan.aTeam.detectedDomains.join(', ')}.`, autonomyPlan.aTeam, 'info');
    } else if (autonomyPlan.aTeam.recommended && autonomyPlan.trinity.recommended) {
      autonomyPlan.aTeam.reason = 'A-Team dispatch was deferred so the orchestrator can decide whether Trinity is the better mission shape.';
      emit(agentId, 'A_TEAM_DEFERRED', 'TRINITY_DECISION_GATE', autonomyPlan.aTeam.reason, autonomyPlan.aTeam, 'info');
    } else if (autonomyPlan.aTeam.recommended) {
      autonomyPlan.aTeam.reason = `The mission needs ${aTeamWorkerCount} specialists, but the token budget funds only ${affordableAteamMembers}.`;
      emit(agentId, 'A_TEAM_SKIPPED', 'BUDGET_GUARD', autonomyPlan.aTeam.reason, autonomyPlan.aTeam, 'warning');
    }
    const modelTenant = normalizedMission.workspaceId
      ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
      : null;
    autonomyPlan.localModelReview = await consultLocalModels(db, agentId, normalizedMission, autonomyPlan, modelTenant || {});
    emit(agentId, 'LOCAL_MODEL_ROUTING', 'PLAN_REVIEW', autonomyPlan.localModelReview.consulted ? `Local model ${autonomyPlan.localModelReview.selectedModel} reviewed the orchestration plan.` : 'No local model review was available; continuing with the frontier orchestrator.', autonomyPlan.localModelReview, autonomyPlan.localModelReview.consulted ? 'info' : 'warning');
    const organizationState = await dynamicOrganization.getState(db, agentId);
    if (!organizationState) {
      const initialized = await dynamicOrganization.changeOrganization(db, {
        orchestratorId: agentId,
        organization: autonomyPlan.organization,
        reason: 'Initial organization selected from the strategy contract.',
        changedBy: agentId
      });
      emit(agentId, 'ORGANIZATION_INITIALIZED', 'ORGANIZE', `Initialized '${initialized.organization}' organization.`, initialized, 'info');
    } else {
      autonomyPlan.organization = organizationState.organization;
      emit(agentId, 'ORGANIZATION_RESTORED', 'ORGANIZE', `Restored runtime organization '${organizationState.organization}'.`, organizationState, 'info');
    }
  }
  const silentUpdates = userProgress.silenceRequested(
    normalizedMission.prompt || normalizedMission.currentTask || '',
    normalizedMission.silentUpdates === true || normalizedMission.executionPolicy?.silentUpdates === true
  );
  normalizedMission.executionPolicy = {
    allowedCommands: Array.isArray(normalizedMission.executionPolicy?.allowedCommands)
      ? [...new Set(normalizedMission.executionPolicy.allowedCommands.map((value) => String(value).trim()).filter(Boolean))]
      : [],
    allowFileEdits: normalizedMission.executionPolicy?.allowFileEdits === true,
    silentUpdates
  };
  normalizedMission.userReporting = userProgress.reportingPolicy(normalizedMission.prompt || normalizedMission.currentTask || '', silentUpdates);
  if (dispatchedAgent.execution_mode === 'orchestrator' && !normalizedMission.toolLease?.length) {
    normalizedMission.toolLease = orchestratorToolLease(autonomyPlan || {});
  }
  const runtimeBudget = autonomyPlan
    ? {
      ...normalizedMission.executionBudget,
      tokens: Math.max(1, Math.floor(autonomyPlan.tokenPolicy.total * autonomyPlan.tokenPolicy.orchestratorReserve))
    }
    : normalizedMission.executionBudget;
  const executionRun = await strategyExecution.createExecutionRun(db, {
    agentId,
    budget: runtimeBudget,
    contractRecord
  });
  if (dispatchedAgent.execution_mode === 'orchestrator') {
    userProgress.report({
      orchestratorId: agentId,
      sourceAgentId: agentId,
      phase: 'started',
      message: `Mission started. The orchestrator selected '${contractRecord.primaryStrategy}' and is organizing the work.`,
      next: ['decompose the mission', 'collect worker evidence', 'verify the result'],
      silent: silentUpdates
    });
  }
  if (normalizedMission.localModel) return runLocalWorker(db, normalizedMission, executionRun);

  // The orchestrator creates and dispatches its own bounded worker fleet. A worker
  // never recurses here: authority is deliberately one-way.
  let autonomousWorkers = [];
  if (dispatchedAgent.execution_mode === 'orchestrator' && normalizedMission.autonomousOrchestration !== false) {
    autonomousWorkers = await createAutonomousWorkers(db, dispatchedAgent, autonomyPlan, normalizedMission);
    if (autonomyPlan.aTeam?.activated && autonomousWorkers.length) {
      emit(agentId, 'A_TEAM_COMPOSED', 'COMPOSE_TEAM', `Composed an A-Team with ${autonomousWorkers.length} specialized members.`, {
        domains: autonomyPlan.aTeam.detectedDomains,
        members: autonomousWorkers.map((worker) => ({ workerId: worker.agentId, name: worker.name, role: worker.role }))
      }, 'info');
    }
    if (autonomyPlan.trinity?.activated && autonomousWorkers.length) {
      const trinityMissionId = `trinity_${agentId}_${Date.now()}`;
      for (const [index, worker] of autonomousWorkers.entries()) {
        const member = autonomyPlan.trinity.members[index];
        await db.run(
          `INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
           VALUES (?, ?, ?, ?, ?, 'running', ?)`,
          `${trinityMissionId}_world_${index + 1}`,
          normalizedMission.prompt || normalizedMission.currentTask || 'Trinity mission',
          index + 1, worker.name, member.role, worker.agentId
        );
      }
      emit(agentId, 'TRINITY_LAUNCHED', 'COMPOSE_TRINITY', 'Launched three isolated Trinity comparison worlds.', {
        missionId: trinityMissionId,
        worlds: autonomousWorkers.map((worker, index) => ({ workerId: worker.agentId, worldNumber: index + 1, strategy: autonomyPlan.trinity.members[index].role }))
      }, 'info');
    }
    for (const worker of autonomousWorkers) {
      emit(agentId, 'AUTONOMOUS_WORKER_CREATED', 'FORK', `Created autonomous worker '${worker.name}'.`, { workerId: worker.agentId, role: worker.role, tokenBudget: worker.executionBudget.tokens });
    }
    if (autonomousWorkers.length) {
      userProgress.report({
        orchestratorId: agentId,
        phase: 'working',
        message: `The orchestrator dispatched ${autonomousWorkers.length} worker${autonomousWorkers.length === 1 ? '' : 's'}: ${autonomousWorkers.map((worker) => worker.name).join(', ')}.`,
        next: autonomousWorkers.map((worker) => worker.prompt.split('\n')[1] || worker.role),
        silent: silentUpdates
      });
    }
    if (autonomousWorkers.length && autonomyPlan.tokenPolicy.rounds?.continuation?.survivorCount) autonomousRounds.set(agentId, { plan: autonomyPlan, workerIds: new Set(autonomousWorkers.map((worker) => worker.agentId)), workers: new Map(autonomousWorkers.map((worker) => [worker.agentId, worker])), results: new Map(), advanced: false });
  }

  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = normalizedMission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const child = spawn(resolvedExecutable, [], {
    cwd: workspaceRoot,
    env: { ...process.env, ...runtimeEnvironment, GENOS_WORKSPACE_ROOT: workspaceRoot, GENOS_SILENT_UPDATES: silentUpdates ? 'true' : 'false' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  activeProcesses.set(agentId, child);
  // This marker distinguishes a deliberate control-plane stop from a runtime
  // failure.  SIGTERM makes a child exit non-zero on many platforms, so the
  // close handler must not turn our own guardrail into AGENT_FAILED.
  let termination = null;
  let executionQueue = Promise.resolve();
  const haltRuntime = (kind, reason, detail, payload = {}) => {
    if (termination) return false;
    termination = { kind, reason };
    emit(agentId, 'AGENT_RUNTIME_HALT_REQUESTED', kind.toUpperCase(), detail, { reason, ...payload }, 'critical', 'blocked');
    child.kill('SIGTERM');
    return true;
  };
  const emitTracked = (eventType, action, detail, payload = {}, severity = 'info', status) => {
    const event = emit(agentId, eventType, action, detail, payload, severity, status);
    const userMilestone = userProgress.milestoneFromEvent(event, {
      agentId,
      agentName: normalizedMission.name || dispatchedAgent.name,
      task: normalizedMission.prompt || normalizedMission.currentTask
    });
    if (userMilestone) {
      userProgress.report({
        orchestratorId: normalizedMission.orchestratorAgentId || agentId,
        sourceAgentId: agentId,
        ...userMilestone,
        silent: silentUpdates
      });
    }
    const workerFailure = dispatchedAgent.execution_mode === 'worker'
      && ['WORKER_TASK_FAILED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
    if (workerFailure) queueWorkerRecovery(normalizedMission, event);
    if (dispatchedAgent.execution_mode === 'worker' && eventType === 'WORKER_NO_ANSWER_PROVEN') {
      const report = workerRecovery.failureReport(event, normalizedMission);
      const decision = workerRecovery.decideRecovery(report);
      emit(dispatchedAgent.parent_agent_id, 'WORKER_NO_ANSWER_ACCEPTED', 'CONCLUDE_NO_ANSWER', decision.reason, {
        workerId: agentId, proof: report.noAnswerProof
      }, 'info');
    }
    const decision = workerFailure ? null : decideFromEvent(event);
    if (decision) {
      db.get('SELECT parent_agent_id FROM agents WHERE id = ?', agentId).then((agent) => {
        const ownerId = agent?.parent_agent_id || agentId;
        emit(ownerId, 'ORCHESTRATION_DECISION', decision.action, decision.reason, { sourceAgentId: agentId, sourceEvent: eventType, ...decision }, 'info');
        if (decision.organization) applyOrganizationDecision(ownerId, decision.organization, decision.reason).catch(() => {});
        actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: agentId, decision, event, workspaceRoot }).catch(() => {});
      }).catch(() => {});
    }
    executionQueue = executionQueue
      .then(() => strategyExecution.recordExecutionEvent(db, agentId, event))
      .then(async (decision) => {
        // Codex reports aggregate usage on `turn.completed` (mapped to VERIFY).
        // At that point the model has already produced its final report; record
        // a budget breach on the execution run, but do not SIGTERM a completed
        // turn and overwrite its result with AGENT_HALTED.
        const finalEvent = ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'].includes(eventType) || event.action === 'VERIFY';
        const observation = await hallucinationMonitor.recordObservation(db, event);
        if (observation.monitored && observation.detected) {
          emit(agentId, 'HALLUCINATION_DETECTED', 'EVIDENCE_GATE', observation.reasons.join('; '), {
            sourceEventId: event.id, sourceEventType: eventType, total: observation.total, reasons: observation.reasons
          }, 'warning');
          const autopsy = await resilienceService.evaluateApoptosis(agentId, { hallucinations: observation.total }, db);
          if (autopsy.apoptosisExecuted && !termination && !finalEvent) {
            emit(agentId, 'APOPTOSIS_TRIGGERED', 'HALLUCINATION_LIMIT', autopsy.triggerReason, { autopsy }, 'critical', 'apoptosis');
            haltRuntime('apoptosis', autopsy.triggerReason, 'Runtime halted after the hallucination limit was reached.', { autopsy });
            return;
          }
        }
      // A final runtime event may report that the mission exceeded its budget
      // only after the child has already completed. Record the guardrail on
      // the execution run, but never turn that completed child into a SIGTERM
      // failure and overwrite the agent's terminal state.
      if (decision?.halt && !termination && !finalEvent) {
        emit(agentId, 'STRATEGY_GUARDRAIL_BLOCKED', 'HALT', decision.reason, { runId: executionRun.id }, 'critical', 'error');
        haltRuntime('guardrail', decision.reason, 'Runtime halted by the strategy execution guardrail.', { runId: executionRun.id });
      }
      await advanceAutonomousRound(normalizedMission, event);
      }).catch(() => {});
    return event;
  };

  let stdoutBuffer = Buffer.alloc(0);
  let stderrBuffer = '';
  let terminalEventSeen = false;
  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    stdoutBuffer = decodeEvents(stdoutBuffer, (event) => {
      let payload = {};
      try { payload = event.payloadJson ? JSON.parse(event.payloadJson) : {}; } catch { payload = { raw: event.payloadJson }; }
      const nextStatus = event.status || (event.eventType === 'AGENT_COMPLETED' ? 'idle' : undefined);
      if (['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'].includes(event.eventType)) terminalEventSeen = true;
      if (nextStatus || event.currentTask) {
        executionQueue = executionQueue.then(() => updateAgent(agentId, nextStatus, event.currentTask));
      }
      emitTracked(event.eventType || 'AGENT_STEP', event.action || 'EXECUTE', event.detail || '', payload, event.severity || 'info', nextStatus);
    });
  });
  child.stderr.on('data', (chunk) => {
    const detail = chunk.toString();
    stderrBuffer = `${stderrBuffer}${detail}`.slice(-4000);
    if (detail.trim()) emitTracked('AGENT_RUNTIME_LOG', 'STDERR', detail.trim(), {}, 'warning');
  });
  child.stdin.on('error', (error) => {
    emitTracked('AGENT_RUNTIME_ERROR', 'STDIN', error.message, {}, 'error', 'error');
  });
  child.on('error', async (error) => {
    activeProcesses.delete(agentId);
    if (termination) return;
    terminalEventSeen = true;
    await updateAgent(agentId, 'error', error.message);
    emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  });
  child.on('close', async (code, signal) => {
    activeProcesses.delete(agentId);
    await executionQueue;
    const operatorStop = child.genosStopRequested ? { kind: 'operator', reason: 'Stopped from Studio' } : null;
    const outcome = runtimeExitOutcome(termination || operatorStop, code, signal, stderrBuffer);
    if (!terminalEventSeen || termination || operatorStop) {
      await updateAgent(agentId, outcome.status, outcome.task);
      emitTracked(outcome.eventType, outcome.action, outcome.detail, outcome.payload, outcome.severity, outcome.status);
      await executionQueue;
    }
    if (dispatchedAgent.execution_mode === 'worker') {
      const garage = await workerGarage.state(db, dispatchedAgent.parent_agent_id).catch(() => null);
      emit(dispatchedAgent.parent_agent_id, 'WORKER_SLOT_RELEASED', 'GARAGE', `Worker '${normalizedMission.name || dispatchedAgent.name}' released its active slot.`, {
        workerId: agentId,
        capacity: garage?.capacity || workerGarage.MAX_ACTIVE_WORKERS,
        occupied: garage?.occupied,
        available: garage?.available
      }, 'info');
    }
    await dispatchWorkerRecovery(agentId);
    dispatchPendingContinuation(agentId);
  });
  await updateAgent(agentId, 'running', mission.prompt);
  emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, { executable: resolvedExecutable, executionRunId: executionRun.id, autonomyPlan }, 'info', 'running');
  child.stdin.end(encodeMission({
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || '',
    role: normalizedMission.role || '',
    prompt: normalizedMission.prompt || normalizedMission.currentTask || '',
    modelTier: normalizedMission.modelTier || '',
    workspaceRoot,
    workspaceIsolation: normalizedMission.workspaceIsolation || '',
    agentType: normalizedMission.agentType || '',
    strategyContractJson: JSON.stringify(runtimeStrategyContract),
    executionMode: dispatchedAgent.execution_mode,
    orchestratorAgentId: normalizedMission.orchestratorAgentId || '',
    autonomyPlanJson: JSON.stringify(autonomyPlan || {})
    ,toolLeaseJson: JSON.stringify(normalizedMission.toolLease || []),
    genosCapsuleJson: JSON.stringify(genosCapsule),
    executionPolicyJson: JSON.stringify(normalizedMission.executionPolicy)
  }));
  // Dispatch after the parent mission is framed so workers cannot be mistaken for
  // independent roots. They inherit the immutable strategy contract above.
  for (const worker of autonomousWorkers) {
    startMission({ ...worker, strategyContract: contractRecord.contract, autonomousOrchestration: false }).catch((error) => {
      updateAgent(worker.agentId, 'error', error.message).catch(() => {});
      emit(agentId, 'AUTONOMOUS_WORKER_DISPATCH_FAILED', 'DISPATCH', error.message, { workerId: worker.agentId }, 'error');
      advanceAutonomousRound(worker, { eventType: 'AGENT_RUNTIME_ERROR', payload: {}, detail: error.message }).catch(() => {});
    });
  }
  return { started: true, executionRun };
}

function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  if (!agentId) return Promise.reject(new Error('agentId is required'));
  if (activeProcesses.has(agentId) || missionStarts.has(agentId)) return Promise.resolve({ started: true, duplicate: true });
  const start = startMissionInternal(mission).finally(async () => {
    missionStarts.delete(agentId);
    await dispatchWorkerRecovery(agentId);
    dispatchPendingContinuation(agentId);
  });
  missionStarts.set(agentId, start);
  return start;
}

function stopMission(agentId) {
  const child = activeProcesses.get(agentId);
  if (!child) return false;
  // The close handler recognizes this marker as an operator-requested halt,
  // rather than reporting SIGTERM as a runtime failure.
  child.genosStopRequested = true;
  child.kill('SIGTERM');
  return true;
}

function stopAllMissions() {
  return [...activeProcesses.keys()].filter(stopMission);
}

module.exports = { startMission, stopMission, stopAllMissions, configuredExecutable, bundledRuntimeEnvironment, runtimeAvailability, createIsolatedWorkspace, provisionMissionWorkspace, runtimeExitOutcome, evidenceScore, workerToolLease, orchestratorToolLease, rankLocalModels };
