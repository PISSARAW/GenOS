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
const { selectSurvivors } = require('./tokenAllocationService');

const activeProcesses = new Map();
const autonomousRounds = new Map();

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
  return probe.status === 0
    ? { available: true }
    : { available: false, reason: `Codex executor is unavailable: ${codex}` };
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
async function advanceAutonomousRound(mission, event) { const round = mission.budgetRound; if (round?.stage !== 'initial' || !['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED'].includes(event.eventType)) return; const state = autonomousRounds.get(round.orchestratorId); if (!state || state.advanced || !state.workerIds.has(mission.agentId)) return; state.results.set(mission.agentId, { agentId: mission.agentId, status: event.eventType === 'AGENT_COMPLETED' ? 'completed' : 'failed', evidenceScore: evidenceScore(event.payload), payload: event.payload || {} }); if (state.results.size < state.workerIds.size) return; state.advanced = true; const continuation = state.plan.tokenPolicy.rounds?.continuation; const survivors = selectSurvivors([...state.results.values()], continuation?.survivorCount); emit(round.orchestratorId, 'TOKEN_ROUND_EVALUATED', 'SUCCESSIVE_HALVING', `Initial screening selected ${survivors.length} of ${state.workerIds.size} branches.`, { allocation: state.plan.tokenPolicy.allocation, initial: state.plan.tokenPolicy.rounds.initial, continuation, survivors: survivors.map(({ agentId, evidenceScore: score }) => ({ agentId, evidenceScore: score })) }, 'info'); for (const survivor of survivors) { const previous = state.workers.get(survivor.agentId); const dossier = JSON.stringify(survivor.payload.evidenceReport || {}).slice(0, 8000); startMission({ ...previous, prompt: `${previous.prompt}\n\nBudget round: continuation. You were selected after evidence scoring. Use the remaining ${continuation.perWorkerTokens} tokens only to resolve the highest-value uncertainty and return a final evidence report. Initial dossier:\n${dossier}`, executionBudget: { ...previous.executionBudget, tokens: continuation.perWorkerTokens }, budgetRound: { stage: 'continuation', orchestratorId: round.orchestratorId } }).catch((error) => emit(round.orchestratorId, 'TOKEN_ROUND_DISPATCH_FAILED', 'SUCCESSIVE_HALVING', error.message, { workerId: survivor.agentId }, 'error')); } autonomousRounds.delete(round.orchestratorId); }

function workerToolLease(role) {
  const lease = ['genos_search_failures', 'genos_diagnose', 'genos_hypothesis_evidence', 'genos_snapshot', 'genos_run', 'genos_diff', 'genos_evaluate_trajectories', 'genos_record_experience', 'genos_replay'];
  if (/reviewer|observer/i.test(role || '')) lease.push('genos_adversarial_review');
  if (/red_team|blue_team/i.test(role || '')) lease.push('genos_security_coevolution');
  return lease;
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

async function provisionMissionWorkspace(mission, executionMode) {
  // An orchestrator is the authority boundary for a mission and must never
  // operate directly in the caller's workspace. Workers already receive a
  // capsule from their orchestrator, so preserve their assigned root.
  if (executionMode !== 'orchestrator' || mission.workspaceProvisioned === true) return mission;
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, mission.agentId);
  return { ...mission, workspaceRoot, capsuleRoot: path.dirname(workspaceRoot) };
}

async function consultLocalModels(db, agentId, mission, plan) {
  const candidates = await localModelDiscovery.discoverChatModelUris();
  if (!candidates.length) return { consulted: false, candidates: [] };
  try {
    const result = await modelRouter.generate({
      db, agentId, model: candidates[0], timeoutMs: 15000,
      policy: { primary: candidates[0], preferLocal: true },
      prompt: `You are the local planning model for a GenOS orchestrator. Analyse this mission and return a concise JSON-like recommendation: which hypotheses merit forks, which worker roles are needed, when replay/merge is justified, and what can be delegated locally. Mission: ${mission.prompt || mission.currentTask || ''}. Strategy profile: ${JSON.stringify(plan.profile)}.`
    });
    return { consulted: true, candidates, selectedModel: result.model, provider: result.provider, advice: String(result.text || '').slice(0, 8000), route: result.route };
  } catch (error) {
    return { consulted: false, candidates, error: error.message };
  }
}

async function localWorkerRoute(role) {
  const cpuCount = os.cpus().length;
  const load = os.loadavg()[0];
  const freeMemoryRatio = os.freemem() / os.totalmem();
  const models = await localModelDiscovery.discoverLocalModels();
  const localCodeEnabled = process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1';
  const reviewRole = /reviewer|observer|red_team|blue_team/i.test(role || '');
  const implementationRole = /implementation|coder|developer/i.test(role || '');
  const eligible = (reviewRole || (localCodeEnabled && implementationRole)) && cpuCount >= 4 && load < cpuCount * 0.8 && freeMemoryRatio >= 0.15;
  const selected = eligible ? models.find((model) => model.chatCapable) : null;
  return {
    selectedModel: selected?.uri || null,
    criteria: { cpuCount, load1m: load, freeMemoryRatio: Number(freeMemoryRatio.toFixed(3)), role, eligible, discoveredModels: models.map((model) => model.uri) }
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
      policy: { primary: mission.localModel, preferLocal: true },
      prompt: codeWorker
        ? `You are a bounded GenOS local code worker. Return only strict JSON {"format":"genos.file-replacement/v1","patches":[{"path":"relative/source/file","content":"complete replacement content"}],"tests":["cargo test --quiet"],"evidence":"brief proof"}. One or two allow-listed tests are mandatory. You may alter only source files, never tests, manifests, secrets, locks, or configuration. Your changes stay in the isolated capsule and are never merged automatically. Branch mission:\n${mission.prompt}`
        : `You are a bounded GenOS local worker. Do not modify files or spawn agents. Analyse this assigned branch, identify risks, tests, counterexamples, and evidence for the orchestrator. Branch mission:\n${mission.prompt}`
    });
    const proposal = codeWorker ? await localCodeWorker.executeProposal({ workspaceRoot: mission.workspaceRoot, text: result.text }) : null;
    await updateAgent(mission.agentId, 'idle', 'Local review completed');
    const completed = emit(mission.agentId, 'AGENT_COMPLETED', codeWorker ? 'LOCAL_CODE_PROPOSAL' : 'LOCAL_REVIEW', codeWorker ? 'Local worker produced a non-merged capsule diff and test evidence.' : 'Local-model worker completed its evidence review.', { executionRunId: executionRun.id, model: result.model, provider: result.provider, advice: result.text, proposal, usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens } }, 'info', 'idle');
    await strategyExecution.recordExecutionEvent(db, mission.agentId, completed);
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
    await strategyExecution.recordExecutionEvent(db, mission.agentId, failed);
    return { started: false, executionRun, local: true, error: error.message };
  }
}

async function createAutonomousWorkers(db, orchestrator, plan, mission) {
  const assignments = plan.dispatchWorkers || [];
  if (!assignments.length) return [];
  const parent = await db.get(
    'SELECT id, name, agent_type, workspace_id, fleet_id, model_tier, language, isolation_mode, current_task FROM agents WHERE id = ?',
    orchestrator.id
  );
  if (!parent) throw new Error(`Orchestrator '${orchestrator.id}' disappeared before worker creation`);
  const initialRound = plan.tokenPolicy.rounds?.initial;
  const perWorkerTokens = Math.max(1, initialRound?.perWorkerTokens || Math.floor((plan.tokenPolicy.total * plan.tokenPolicy.workerShare) / assignments.length));
  const workers = [];
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  for (const [index, assignment] of assignments.entries()) {
    const id = autonomousWorkerId(orchestrator.id, index + 1);
    const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, id, mission.capsuleRoot);
    const localRoute = await localWorkerRoute(assignment.role);
    const prompt = [mission.prompt || parent.current_task || 'Autonomous task execution', `Assigned branch: ${assignment.label}.`, `Hypothesis: ${assignment.hypothesis}`, plan.tokenPolicy.allocation === 'successive_halving_with_reallocation' ? `Budget round: initial screening. Use at most ${perWorkerTokens} tokens.` : `Budget allocation: ${perWorkerTokens} tokens.`].join('\n');
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
       VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'autonomous_strategy_branch', ?, ?)`,
      id, `${parent.name} · ${assignment.label}`, assignment.role, parent.agent_type || 'GenOS',
      parent.workspace_id || null, parent.fleet_id || null, localRoute.selectedModel || assignment.modelTier || parent.model_tier || 'standard',
      parent.language || 'TypeScript', parent.isolation_mode || 'Branch', parent.id,
      `Autonomous branch created by ${parent.name}. Budget round: initial; allocation: ${perWorkerTokens} tokens.`, prompt
    );
    workers.push({
      agentId: id, name: `${parent.name} · ${assignment.label}`, role: assignment.role, prompt,
      modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode,
      workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type,
      workspaceRoot, localModel: localRoute.selectedModel, localRoutingCriteria: localRoute.criteria, toolLease: workerToolLease(assignment.role),
      executionBudget: { ...mission.executionBudget, tokens: perWorkerTokens }, orchestratorAgentId: parent.id, budgetRound: { stage: 'initial', orchestratorId: parent.id }
    });
  }
  return workers;
}

async function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  const normalizedMission = { ...mission, agentId };
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const executable = configuredExecutable();
  const db = await getDatabase();
  const dispatchedAgent = await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId);
  Object.assign(normalizedMission, await provisionMissionWorkspace(normalizedMission, dispatchedAgent.execution_mode));
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
  if (activeProcesses.has(agentId)) return { started: true, duplicate: true };
  let contractRecord = await strategyContracts.getLatestContract(db, agentId);
  if (!contractRecord && normalizedMission.orchestratorAgentId) {
    contractRecord = await strategyContracts.getLatestContract(db, normalizedMission.orchestratorAgentId);
  }
  if (!contractRecord) throw new Error(`No strategy contract available for agent ${agentId}`);
  const autonomyPlan = dispatchedAgent.execution_mode === 'orchestrator'
    ? buildAutonomyPlan(contractRecord.contract, normalizedMission.executionBudget)
    : null;
  if (autonomyPlan) {
    autonomyPlan.localModelReview = await consultLocalModels(db, agentId, normalizedMission, autonomyPlan);
    emit(agentId, 'LOCAL_MODEL_ROUTING', 'PLAN_REVIEW', autonomyPlan.localModelReview.consulted ? `Local model ${autonomyPlan.localModelReview.selectedModel} reviewed the orchestration plan.` : 'No local model review was available; continuing with the frontier orchestrator.', autonomyPlan.localModelReview, autonomyPlan.localModelReview.consulted ? 'info' : 'warning');
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
  if (normalizedMission.localModel) return runLocalWorker(db, normalizedMission, executionRun);

  // The orchestrator creates and dispatches its own bounded worker fleet. A worker
  // never recurses here: authority is deliberately one-way.
  let autonomousWorkers = [];
  if (dispatchedAgent.execution_mode === 'orchestrator' && normalizedMission.autonomousOrchestration !== false) {
    autonomousWorkers = await createAutonomousWorkers(db, dispatchedAgent, autonomyPlan, normalizedMission);
    for (const worker of autonomousWorkers) {
      emit(agentId, 'AUTONOMOUS_WORKER_CREATED', 'FORK', `Created autonomous worker '${worker.name}'.`, { workerId: worker.agentId, role: worker.role, tokenBudget: worker.executionBudget.tokens });
    }
    if (autonomousWorkers.length && autonomyPlan.tokenPolicy.rounds?.continuation?.survivorCount) autonomousRounds.set(agentId, { plan: autonomyPlan, workerIds: new Set(autonomousWorkers.map((worker) => worker.agentId)), workers: new Map(autonomousWorkers.map((worker) => [worker.agentId, worker])), results: new Map(), advanced: false });
  }

  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = normalizedMission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const child = spawn(resolvedExecutable, [], { cwd: workspaceRoot, env: { ...process.env, GENOS_WORKSPACE_ROOT: workspaceRoot }, stdio: ['pipe', 'pipe', 'pipe'] });
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
    const decision = decideFromEvent(event);
    if (decision) {
      db.get('SELECT parent_agent_id FROM agents WHERE id = ?', agentId).then((agent) => {
        const ownerId = agent?.parent_agent_id || agentId;
        emit(ownerId, 'ORCHESTRATION_DECISION', decision.action, decision.reason, { sourceAgentId: agentId, sourceEvent: eventType, ...decision }, 'info');
        actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: agentId, decision, event, workspaceRoot }).catch(() => {});
      }).catch(() => {});
    }
    executionQueue = executionQueue
      .then(() => strategyExecution.recordExecutionEvent(db, agentId, event))
      .then(async (decision) => {
        const finalEvent = ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
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
  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    stdoutBuffer = decodeEvents(stdoutBuffer, (event) => {
      let payload = {};
      try { payload = event.payloadJson ? JSON.parse(event.payloadJson) : {}; } catch { payload = { raw: event.payloadJson }; }
      const nextStatus = event.status || (event.eventType === 'AGENT_COMPLETED' ? 'idle' : undefined);
      if (nextStatus || event.currentTask) updateAgent(agentId, nextStatus, event.currentTask).catch(() => {});
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
    await updateAgent(agentId, 'error', error.message);
    emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  });
  child.on('close', async (code, signal) => {
    activeProcesses.delete(agentId);
    const operatorStop = child.genosStopRequested ? { kind: 'operator', reason: 'Stopped from Studio' } : null;
    const outcome = runtimeExitOutcome(termination || operatorStop, code, signal, stderrBuffer);
    await updateAgent(agentId, outcome.status, outcome.task);
    emitTracked(outcome.eventType, outcome.action, outcome.detail, outcome.payload, outcome.severity, outcome.status);
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
    ,toolLeaseJson: JSON.stringify(normalizedMission.toolLease || [])
  }));
  // Dispatch after the parent mission is framed so workers cannot be mistaken for
  // independent roots. They inherit the immutable strategy contract above.
  for (const worker of autonomousWorkers) {
    startMission({ ...worker, strategyContract: contractRecord.contract, autonomousOrchestration: false }).catch((error) => {
      emit(agentId, 'AUTONOMOUS_WORKER_DISPATCH_FAILED', 'DISPATCH', error.message, { workerId: worker.agentId }, 'error');
    });
  }
  return { started: true, executionRun };
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

module.exports = { startMission, stopMission, stopAllMissions, configuredExecutable, runtimeAvailability, createIsolatedWorkspace, provisionMissionWorkspace, runtimeExitOutcome, evidenceScore };
