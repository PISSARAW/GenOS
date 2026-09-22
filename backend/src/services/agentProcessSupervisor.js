/**
 * Process supervision for one agent runtime: spawns the framed-protobuf child,
 * decodes its event stream into telemetry, guardrails, and orchestration
 * decisions, and translates the exit into a terminal agent outcome.
 */
const path = require('path');
const { spawn } = require('child_process');
const { encodeMission } = require('./runtimeProtocol');
const { resolveExecutable, isLocalRuntime } = require('./agentRuntimeExecutable');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');
const { decideFromEvent } = require('./orchestrationDecisionService');
const actionExecutor = require('./orchestrationActionExecutor');
const userProgress = require('./userProgressService');
const {
  activeProcesses, activeWorkerBarriers, workerEvidenceRounds, emit, updateAgent
} = require('./agentOrchestrationState');
const { recordWorkerEvidence, hasDecisionEvidence, decisionEvidenceFailure } = require('./agentEvidenceService');
const { queueWorkerRecovery, applyOrganizationDecision } = require('./agentRecoveryService');
const workspaceLifecycle = require('./agentWorkspaceLifecycleService');
const agentConscience = require('./agentConscienceService');
const { terminateChild } = require('./processTermination');
const {
  buildRuntimeEnvironment,
  buildReplayManifest,
  runtimeExitOutcome
} = require('./agentProcessOutcome');
const {
  processEventQueueImpl,
  handleStdoutData,
  handleStderrData,
  handleStdinError,
  handleChildError,
  handleChildClose
} = require('./agentProcessEventPipeline');

function buildTrackedEventPayload(payload, executionRun, contractRecord) {
  return {
    ...payload,
    executionRunId: payload.executionRunId || executionRun.id,
    contractId: payload.contractId || contractRecord.id,
    contractVersion: payload.contractVersion || contractRecord.version
  };
}

function reportUserMilestone(ctx, event) {
  const { agentId, normalizedMission, dispatchedAgent, silentUpdates } = ctx;
  const userMilestone = userProgress.milestoneFromEvent(event, {
    agentId,
    agentName: normalizedMission.name || dispatchedAgent.name,
    task: normalizedMission.prompt || normalizedMission.currentTask
  });
  if (!userMilestone) return;
  userProgress.report({
    orchestratorId: normalizedMission.orchestratorAgentId || agentId,
    sourceAgentId: agentId,
    ...userMilestone,
    silent: silentUpdates
  });
}

function isWorkerFailureEvent(dispatchedAgent, eventType) {
  return dispatchedAgent.execution_mode === 'worker'
    && ['WORKER_TASK_FAILED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
}

function handleWorkerNoAnswer(ctx, event, eventType) {
  const { agentId, dispatchedAgent, normalizedMission } = ctx;
  if (dispatchedAgent.execution_mode !== 'worker' || eventType !== 'WORKER_NO_ANSWER_PROVEN') return;
  const report = workerRecovery.failureReport(event, normalizedMission);
  const decision = workerRecovery.decideRecovery(report);
  emit(dispatchedAgent.parent_agent_id, 'WORKER_NO_ANSWER_ACCEPTED', 'CONCLUDE_NO_ANSWER', decision.reason, {
    workerId: agentId, proof: report.noAnswerProof
  }, 'info');
}

function handleOrchestrationDecision(ctx, event, eventType) {
  const { db, agentId, normalizedMission } = ctx;
  const workerFailure = isWorkerFailureEvent(ctx.dispatchedAgent, eventType);
  if (workerFailure || !hasDecisionEvidence(event)) {
    if (!workerFailure) {
      emit(normalizedMission.orchestratorAgentId || agentId, 'ORCHESTRATION_DECISION_BLOCKED', 'EVIDENCE_GATE', decisionEvidenceFailure(event), {
        sourceAgentId: agentId, sourceEvent: eventType
      }, 'warning', 'blocked');
    }
    return;
  }
  const decision = decideFromEvent(event);
  if (!decision) return;
  db.get('SELECT parent_agent_id FROM agents WHERE id = ?', agentId)
    .then((agent) => { applyOrchestrationDecision(ctx, agent, event, eventType, decision); })
    .catch((error) => reportOrchestrationActionFailure({ ownerId: normalizedMission.orchestratorAgentId || agentId, agentId, event, decision, error }));
}

function applyOrchestrationDecision(ctx, ...args) {
  const [agent, event, eventType, decision] = args;
  const { agentId, workspaceRoot } = ctx;
  const ownerId = agent?.parent_agent_id || agentId;
  emit(ownerId, 'ORCHESTRATION_DECISION', decision.action, decision.reason, { sourceAgentId: agentId, sourceEvent: eventType, ...decision }, 'info');
  if (decision.organization) {
    applyOrganizationDecision(ownerId, decision.organization, decision.reason)
      .catch((error) => reportOrchestrationActionFailure({ ownerId, agentId, event, decision, error }));
  }
  actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: agentId, decision, event, workspaceRoot })
    .catch((error) => reportOrchestrationActionFailure({ ownerId, agentId, event, decision, error }));
}

function reportOrchestrationActionFailure({ ownerId, agentId, event, decision, error }) {
  const failure = {
    sourceAgentId: agentId,
    sourceEvent: event.eventType,
    eventId: event.id,
    tool: decision.tool,
    error: error?.message || String(error)
  };
  emit(ownerId, 'ORCHESTRATION_ACTION_FAILED', decision.action, `Orchestration action '${decision.action}' raised an exception.`, failure, 'error', 'error');
  return failure;
}

function enqueueTrackedEvent(ctx, event) {
  const { agentId, state } = ctx;
  state.eventQueue.push(event);
  if (state.eventQueue.length <= state.maxEventQueue) return;
  state.eventQueue.shift();
  state.droppedEventCount += 1;
  emit(agentId, 'RUNTIME_EVENT_QUEUE_OVERFLOW', 'QUEUE_DROP', `Runtime event queue dropped ${state.droppedEventCount} event(s) after reaching capacity ${state.maxEventQueue}.`, {
    droppedEventCount: state.droppedEventCount,
    capacity: state.maxEventQueue,
    droppedEventType: event.eventType
  }, 'critical', 'error');
  haltRuntimeImpl(ctx, 'event_queue_overflow', 'Runtime event queue capacity exceeded.', 'Runtime halted because event persistence could no longer keep up with the child process.', { droppedEventCount: state.droppedEventCount, capacity: state.maxEventQueue });
}

function haltRuntimeImpl(ctx, ...args) {
  const [kind, reason, detail, payload = {}] = args;
  if (ctx.state.termination) return false;
  ctx.state.termination = { kind, reason };
  emit(ctx.agentId, 'AGENT_RUNTIME_HALT_REQUESTED', kind.toUpperCase(), detail, { reason, ...payload }, 'critical', 'blocked');
  terminateChild(ctx.child);
  return true;
}

function emitTrackedImpl(ctx, ...args) {
  const [eventType, action, detail, payload = {}, severity = 'info', status] = args;
  const eventPayload = buildTrackedEventPayload(payload, ctx.executionRun, ctx.contractRecord);
  const event = emit(ctx.agentId, eventType, action, detail, eventPayload, severity, status);
  recordWorkerEvidence(ctx.normalizedMission, event);
  reportUserMilestone(ctx, event);
  const workerFailure = isWorkerFailureEvent(ctx.dispatchedAgent, eventType);
  if (workerFailure) queueWorkerRecovery(ctx.normalizedMission, event);
  handleWorkerNoAnswer(ctx, event, eventType);
  handleOrchestrationDecision(ctx, event, eventType);
  enqueueTrackedEvent(ctx, event);
  ctx.processEventQueue(ctx);
  return event;
}

function shouldTrackWorkspace(normalizedMission, dispatchedAgent) {
  return normalizedMission.workspaceProvisioned === true || dispatchedAgent.execution_mode === 'orchestrator';
}

async function applyLocalRouting(ctx) {
  const { db, agentId, normalizedMission, resolvedExecutable } = ctx;
  if (!(isLocalRuntime(resolvedExecutable) && !normalizedMission.localRoutingPolicy)) return;
  const workspace = normalizedMission.workspaceId
    ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
    : {};
  const discovered = await localModelDiscovery.discoverChatModelUris();
  normalizedMission.localRoutingPolicy = await modelRouter.localRoutingPolicy(db, { agentId, ...workspace }, discovered);
  normalizedMission.localModel = normalizedMission.localRoutingPolicy.primary;
}

function buildMissionIdentity(agentId, normalizedMission, dispatchedAgent) {
  return {
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || '',
    nameMeaning: normalizedMission.nameMeaning || dispatchedAgent.name_meaning || '',
    role: normalizedMission.role || '',
    prompt: normalizedMission.prompt || normalizedMission.currentTask || ''
  };
}

function buildMissionEnvelope(ctx, identity, runtimeStrategyContract) {
  const { normalizedMission, dispatchedAgent, workspaceRoot, genosCapsule, runtimeBudget, autonomyPlan } = ctx;
  return {
    ...identity,
    modelTier: normalizedMission.modelTier || '',
    workspaceRoot,
    workspaceIsolation: normalizedMission.workspaceIsolation || '',
    agentType: normalizedMission.agentType || '',
    strategyContractJson: JSON.stringify(runtimeStrategyContract),
    executionMode: dispatchedAgent.execution_mode,
    orchestratorAgentId: normalizedMission.orchestratorAgentId || '',
    autonomyPlanJson: JSON.stringify(autonomyPlan || {}),
    toolLeaseJson: JSON.stringify(normalizedMission.toolLease || []),
    genosCapsuleJson: JSON.stringify(genosCapsule),
    executionPolicyJson: JSON.stringify(normalizedMission.executionPolicy),
    executionBudgetJson: JSON.stringify(runtimeBudget || {}),
    localModel: normalizedMission.localModel || '',
    localRoutingPolicyJson: JSON.stringify(normalizedMission.localRoutingPolicy || {})
  };
}

function buildCapabilityPayload(normalizedMission, resolvedExecutable) {
  return {
    toolLease: normalizedMission.toolLease || [],
    runtimeMode: isLocalRuntime(resolvedExecutable) ? 'local' : 'supervised',
    capabilityCount: Array.isArray(normalizedMission.toolLease) ? normalizedMission.toolLease.length : 0
  };
}

function resolveSpawnCommand(resolvedExecutable) {
  if (resolvedExecutable.endsWith('.cjs') || resolvedExecutable.endsWith('.js')) {
    return { spawnCmd: process.execPath, spawnArgs: [resolvedExecutable] };
  }
  return { spawnCmd: resolvedExecutable, spawnArgs: [] };
}

function spawnRuntimeWithRetry(spawnSpec, spawnOptions) {
  // A missing spawn cwd reports as a misleading `spawn <exe> ENOENT` on
  // Windows: a concurrent process (backend server, daemon, delayed cleanup)
  // can reclaim the capsule directory between provisioning and runtime spawn.
  // Recreate the cwd before spawning, and probe the command so a transient
  // antivirus lock does not kill the mission either.
  const { spawnSync, spawn } = require('child_process');
  const fsSync = require('fs');
  if (spawnOptions && spawnOptions.cwd) {
    try { fsSync.mkdirSync(spawnOptions.cwd, { recursive: true }); } catch (_) {}
  }
  const isNodeScript = spawnSpec.cmd === process.execPath;
  for (let attempt = 0; attempt < 3; attempt++) {
    const probe = spawnSync(spawnSpec.cmd, isNodeScript ? ['-e', ''] : ['--version'], { stdio: 'ignore', timeout: 5000 });
    if (!probe.error) break;
    if (!fsSync.existsSync(spawnSpec.cmd) || attempt === 2) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  // Windows can emit an unhandled 'error' on a stdio Socket immediately after
  // spawn returns if the child-side pipe handle closes before the parent has
  // attached its handlers (antivirus, fast-failing runtime, handle recycling).
  // Attach no-op error sinks on the stdio streams synchronously so those
  // socket-level errors never become unhandled rejections, then retry the spawn
  // a few times when it throws a transient ENOTCONN/ECONNREFUSED.
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const child = spawn(spawnSpec.cmd, spawnSpec.args, spawnOptions);
      if (child.stdin) child.stdin.on('error', () => {});
      if (child.stdout) child.stdout.on('error', () => {});
      if (child.stderr) child.stderr.on('error', () => {});
      return child;
    } catch (err) {
      if (attempt < maxAttempts - 1 && (err.code === 'ENOTCONN' || err.code === 'ECONNREFUSED' || err.code === 'EPERM' || err.code === 'EACCES')) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
        continue;
      }
      throw err;
    }
  }
}

async function superviseMission(options) {
  const { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan, runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, executable } = options;
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const conscienceState = await agentConscience.loadConscienceState(db, agentId);
  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = normalizedMission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const { spawnCmd, spawnArgs } = resolveSpawnCommand(resolvedExecutable);
  const child = spawnRuntimeWithRetry({ cmd: spawnCmd, args: spawnArgs }, {
    cwd: workspaceRoot,
    env: buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, silentUpdates),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  // Attach the error handler synchronously: a spawn that fails immediately
  // (ENOENT under antivirus scan, missing runtime) emits 'error' before the
  // async setup below completes, and an unhandled 'error' event crashes the
  // whole bridge process. Buffer it and replay once the full ctx exists.
  let earlyChildError = null;
  child.on('error', (error) => { earlyChildError = earlyChildError || error; });
  const runtimeStartedAt = new Date().toISOString();
  activeProcesses.set(agentId, child);
  await db.run('UPDATE agents SET runtime_pid = ?, runtime_started_at = ?, runtime_executable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', child.pid, runtimeStartedAt, spawnCmd, agentId);
  // Disposable capsules (git worktrees or copies) are reclaimed after the
  // mission ends; a caller-provided workspace is never tracked.
  if (shouldTrackWorkspace(normalizedMission, dispatchedAgent)) {
    await workspaceLifecycle.trackWorkspace(agentId, workspaceRoot);
  }
  // This marker distinguishes a deliberate control-plane stop from a runtime
  // failure.  SIGTERM makes a child exit non-zero on many platforms, so the
  // close handler must not turn our own guardrail into AGENT_FAILED.
  const state = {
    termination: null,
    executionQueue: Promise.resolve(),
    missionDomainState: { hasDomainFailure: false, unverified: true, domainVerdict: 'unverified' },
    eventQueue: [],
    maxEventQueue: Math.max(1, Number(process.env.GENOS_RUNTIME_EVENT_QUEUE_CAPACITY) || 2048),
    droppedEventCount: 0,
    isProcessingEvents: false,
    terminalEventSeen: false,
    stdoutBuffer: Buffer.alloc(0),
    stderrBuffer: ''
  };
  const ctx = { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan, runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, workspaceRoot, resolvedExecutable, child, conscienceState, state };
  const emitTracked = (...args) => { return emitTrackedImpl(ctx, ...args); };
  ctx.emitTracked = emitTracked;
  ctx.haltRuntime = haltRuntimeImpl;
  ctx.processEventQueue = processEventQueueImpl;
  child.stdout.on('data', (chunk) => { handleStdoutData(ctx, chunk); });
  child.stderr.on('data', (chunk) => { handleStderrData(ctx, chunk); });
  child.stdin.on('error', (error) => { handleStdinError(ctx, error); });
  child.on('error', (error) => { handleChildError(ctx, error); });
  child.on('close', (code, signal) => { handleChildClose(ctx, code, signal); });
  // Replay a spawn error that fired before ctx existed, and fail the mission
  // through the normal error path instead of crashing the bridge.
  if (earlyChildError) {
    handleChildError(ctx, earlyChildError);
    throw Object.assign(new Error(`Runtime spawn failed: ${earlyChildError.message}`), { code: 'AGENT_RUNTIME_SPAWN_FAILED' });
  }
  await updateAgent(agentId, 'running', normalizedMission.prompt);
  emitTracked('WORKER_RUNTIME_CAPABILITIES', 'LEASE', 'Worker runtime capabilities activated.', buildCapabilityPayload(normalizedMission, resolvedExecutable), 'info', 'running');
  emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, {
    executable: resolvedExecutable,
    executionRunId: executionRun.id,
    autonomyPlan,
    replayManifest: buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord, autonomyPlan, runtimeBudget, runtimeEnvironment, workspaceRoot, resolvedExecutable })
  }, 'info', 'running');
  await applyLocalRouting(ctx);
  child.stdin.end(encodeMission(buildMissionEnvelope(ctx, buildMissionIdentity(agentId, normalizedMission, dispatchedAgent), runtimeStrategyContract)));
  return { started: true, executionRun };
}

module.exports = { superviseMission, runtimeExitOutcome, buildReplayManifest, reportOrchestrationActionFailure };
