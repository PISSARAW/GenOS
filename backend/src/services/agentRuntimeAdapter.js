/**
 * Provider-neutral bridge between Studio deployments and a real GenOS agent runtime.
 * The configured executable receives one framed protobuf mission on stdin and emits framed
 * protobuf events on stdout. Each event is forwarded to the Studio telemetry bus and agent state.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const strategyExecution = require('./strategyExecutionService');
const strategyContracts = require('./strategyContractService');
const { encodeMission, decodeEvents } = require('./runtimeProtocol');
const agentAuthority = require('./agentAuthorityService');
const { buildAutonomyPlan } = require('./autonomousOrchestrationService');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');

const activeProcesses = new Map();

function configuredExecutable() {
  const configured = String(process.env.GENOS_AGENT_EXECUTOR || '').trim();
  if (configured) return configured;

  // The bundled bridge is the supported local default. Keeping this fallback
  // here makes every launch path (npm, Studio, or an API test) behave the same
  // without requiring a separately managed environment file.
  return path.resolve(__dirname, '../../bin/genos-agent-runtime.cjs');
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

function autonomousWorkerId(orchestratorId, index) {
  return `worker_${orchestratorId}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
}

function workerToolLease(role) {
  const lease = ['genos_search_failures', 'genos_diagnose', 'genos_hypothesis_evidence', 'genos_snapshot', 'genos_run', 'genos_diff', 'genos_evaluate_trajectories', 'genos_record_experience', 'genos_replay'];
  if (/reviewer|observer/i.test(role || '')) lease.push('genos_adversarial_review');
  if (/red_team|blue_team/i.test(role || '')) lease.push('genos_security_coevolution');
  return lease;
}

async function createIsolatedWorkspace(sourceRoot, workerId) {
  const source = path.resolve(sourceRoot);
  // Keep capsules beside (not inside) the source workspace: fs.cp rejects a
  // destination nested under its source and this also keeps the parent clean.
  const capsuleRoot = process.env.GENOS_CAPSULE_ROOT || path.join(path.dirname(source), '.genos-agent-worlds');
  const destination = path.join(capsuleRoot, path.basename(source), workerId);
  // Capsules must never recursively copy previous capsules, build products, or
  // VCS metadata. They remain on disk for replay and evidence-aware merging.
  const excluded = new Set(['.git', '.genos', 'node_modules', 'target']);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    filter: (entry) => !excluded.has(path.basename(entry))
  });
  return destination;
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
  const reviewRole = /reviewer|observer|red_team|blue_team/i.test(role || '');
  const eligible = reviewRole && cpuCount >= 4 && load < cpuCount * 0.8 && freeMemoryRatio >= 0.15;
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
    const result = await modelRouter.generate({
      db, agentId: mission.agentId, model: mission.localModel, timeoutMs: Number(mission.executionBudget?.latencyMs || 30000),
      policy: { primary: mission.localModel, preferLocal: true },
      prompt: `You are a bounded GenOS local worker. Do not modify files or spawn agents. Analyse this assigned branch, identify risks, tests, counterexamples, and evidence for the orchestrator. Branch mission:\n${mission.prompt}`
    });
    await updateAgent(mission.agentId, 'idle', 'Local review completed');
    const completed = emit(mission.agentId, 'AGENT_COMPLETED', 'LOCAL_REVIEW', 'Local-model worker completed its evidence review.', { executionRunId: executionRun.id, model: result.model, provider: result.provider, advice: result.text, usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens } }, 'info', 'idle');
    await strategyExecution.recordExecutionEvent(db, mission.agentId, completed);
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
  const perWorkerTokens = Math.max(1, Math.floor((plan.tokenPolicy.total * plan.tokenPolicy.workerShare) / assignments.length));
  const workers = [];
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  for (const [index, assignment] of assignments.entries()) {
    const id = autonomousWorkerId(orchestrator.id, index + 1);
    const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, id);
    const localRoute = await localWorkerRoute(assignment.role);
    const prompt = [mission.prompt || parent.current_task || 'Autonomous task execution', `Assigned branch: ${assignment.label}.`, `Hypothesis: ${assignment.hypothesis}`].join('\n');
    await db.run(
      `INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
       VALUES (?, ?, ?, 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'autonomous_strategy_branch', ?, ?)`,
      id, `${parent.name} · ${assignment.label}`, assignment.role, parent.agent_type || 'GenOS',
      parent.workspace_id || null, parent.fleet_id || null, localRoute.selectedModel || assignment.modelTier || parent.model_tier || 'standard',
      parent.language || 'TypeScript', parent.isolation_mode || 'Branch', parent.id,
      `Autonomous branch created by ${parent.name}.`, prompt
    );
    workers.push({
      agentId: id, name: `${parent.name} · ${assignment.label}`, role: assignment.role, prompt,
      modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode,
      workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type,
      workspaceRoot, localModel: localRoute.selectedModel, localRoutingCriteria: localRoute.criteria, toolLease: workerToolLease(assignment.role),
      executionBudget: { ...mission.executionBudget, tokens: perWorkerTokens }, orchestratorAgentId: parent.id
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
  }

  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = normalizedMission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const child = spawn(resolvedExecutable, [], { cwd: workspaceRoot, env: { ...process.env, GENOS_WORKSPACE_ROOT: workspaceRoot }, stdio: ['pipe', 'pipe', 'pipe'] });
  activeProcesses.set(agentId, child);
  let guardrailHalted = false;
  let executionQueue = Promise.resolve();
  const emitTracked = (eventType, action, detail, payload = {}, severity = 'info', status) => {
    const event = emit(agentId, eventType, action, detail, payload, severity, status);
    executionQueue = executionQueue.then(() => strategyExecution.recordExecutionEvent(db, agentId, event)).then((decision) => {
      // A final runtime event may report that the mission exceeded its budget
      // only after the child has already completed. Record the guardrail on
      // the execution run, but never turn that completed child into a SIGTERM
      // failure and overwrite the agent's terminal state.
      const finalEvent = ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
      if (decision?.halt && !guardrailHalted && !finalEvent) {
        guardrailHalted = true;
        emit(agentId, 'STRATEGY_GUARDRAIL_BLOCKED', 'HALT', decision.reason, { runId: executionRun.id }, 'critical', 'error');
        child.kill('SIGTERM');
      }
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
    await updateAgent(agentId, 'error', error.message);
    emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  });
  child.on('close', async (code, signal) => {
    activeProcesses.delete(agentId);
    if (code === 0) {
      await updateAgent(agentId, 'idle', 'Execution completed');
      emitTracked('AGENT_COMPLETED', 'COMPLETE', 'Runtime completed successfully.', { code }, 'info', 'idle');
    } else {
      await updateAgent(agentId, 'error', `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`);
      const lastError = stderrBuffer.trim().split(/\r?\n/).filter(Boolean).pop();
      emitTracked('AGENT_FAILED', 'ERROR', `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`, { code, signal, stderr: stderrBuffer.trim() }, 'error', 'error');
    }
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
  child.kill('SIGTERM');
  return true;
}

module.exports = { startMission, stopMission, configuredExecutable, createIsolatedWorkspace };
