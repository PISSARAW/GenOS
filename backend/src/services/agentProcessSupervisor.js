/**
 * Process supervision for one agent runtime: spawns the framed-protobuf child,
 * decodes its event stream into telemetry, guardrails, and orchestration
 * decisions, and translates the exit into a terminal agent outcome.
 */
const path = require('path');
const fsSync = require('fs');
const { spawn } = require('child_process');
const { encodeMission } = require('./runtimeProtocol');
const { resolveExecutable, isLocalRuntime } = require('./agentRuntimeExecutable');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');
const continuousExecution = require('./continuousExecution/runtimeBridge');
const userProgress = require('./userProgressService');
const {
  activeProcesses, activeWorkerBarriers, workerEvidenceRounds, emit, updateAgent
} = require('./agentOrchestrationState');
const { recordWorkerEvidence } = require('./agentEvidenceService');
const agentRecoveryService = require('./agentRecoveryService');
const workerRecovery = require('./workerFailureRecoveryService');
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

const { handle: handleOrchestrationDecision, reportFailure: reportOrchestrationActionFailure } = require('./orchestrationRuntimeDecision');

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

function isDetachedChild(child) {
  if (!child) return false;
  if (typeof child.genosDetached === 'boolean') return child.genosDetached;
  return process.platform !== 'win32';
}

function haltRuntimeImpl(ctx, ...args) {
  const [kind, reason, detail, payload = {}] = args;
  if (ctx.state.termination) return false;
  ctx.state.termination = { kind, reason };
  emit(ctx.agentId, 'AGENT_RUNTIME_HALT_REQUESTED', kind.toUpperCase(), detail, { reason, ...payload }, 'critical', 'blocked');
  terminateChild(ctx.child, isDetachedChild(ctx.child));
  return true;
}

function emitTrackedImpl(ctx, ...args) {
  const [eventType, action, detail, payload = {}, severity = 'info', status] = args;
  const eventPayload = buildTrackedEventPayload(payload, ctx.executionRun, ctx.contractRecord);
  const guarded = continuousExecution.guard(ctx, { eventType, action, detail, payload: eventPayload, severity, status }, false);
  const event = emit(ctx.agentId, guarded.eventType, guarded.action, guarded.detail, guarded.payload, guarded.severity, guarded.status);
  recordWorkerEvidence(ctx.normalizedMission, event);
  reportUserMilestone(ctx, event);
  const workerFailure = isWorkerFailureEvent(ctx.dispatchedAgent, eventType);
  if (workerFailure) agentRecoveryService.queueWorkerRecovery(ctx.normalizedMission, event);
  handleWorkerNoAnswer(ctx, event, eventType);
  enqueueTrackedEvent(ctx, event);
  if (!ctx.state.isProcessingEvents) ctx.state.eventProcessingPromise = ctx.processEventQueue(ctx);
  return event;
}

function shouldTrackWorkspace(normalizedMission, dispatchedAgent) {
  return normalizedMission.workspaceProvisioned === true || dispatchedAgent.execution_mode === 'orchestrator';
}

async function applyLocalRouting(ctx) {
  const { db, agentId, normalizedMission, resolvedExecutable } = ctx;
  if (!isLocalRuntime(resolvedExecutable)) return;
  const explicitRoute = await require('./agentModelRoutingService').explicitLocalRoute(normalizedMission);
  if (explicitRoute) {
    normalizedMission.localModel = explicitRoute.selectedModel;
    normalizedMission.localRoutingPolicy = explicitRoute.policy;
    return;
  }
  if (normalizedMission.localRoutingPolicy) return;
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
  return require('./agentMissionEnvelopeService').build(ctx, identity, runtimeStrategyContract);
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

function ensureCwd(spawnOptions) {
  if (!spawnOptions || !spawnOptions.cwd) return;
  try { fsSync.mkdirSync(spawnOptions.cwd, { recursive: true }); } catch (_) {}
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function probeArgs(spawnSpec) {
  const isNodeScript = spawnSpec.cmd === process.execPath;
  return isNodeScript ? ['-e', ''] : ['--version'];
}

function probeAttempt(spawnSpec) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    let probe;
    try {
      probe = spawn(spawnSpec.cmd, probeArgs(spawnSpec), { stdio: 'ignore' });
    } catch (_) { done(false); return; }
    const timer = setTimeout(() => { try { probe.kill('SIGKILL'); } catch (_) {} done(false); }, 5000);
    if (typeof timer.unref === 'function') timer.unref();
    probe.on('error', () => { clearTimeout(timer); done(false); });
    probe.on('close', (code) => { clearTimeout(timer); done(code === 0); });
  });
}

async function probeCommand(spawnSpec) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await probeAttempt(spawnSpec);
    if (ok) return true;
    if (!fsSync.existsSync(spawnSpec.cmd) || attempt === 2) return false;
    await sleepMs(200);
  }
  return false;
}

function attachNoopErrorSinks(child) {
  if (child.stdin) child.stdin.on('error', () => {});
  if (child.stdout) child.stdout.on('error', () => {});
  if (child.stderr) child.stderr.on('error', () => {});
}

function isTransientSpawnError(err) {
  return err.code === 'ENOTCONN' || err.code === 'ECONNREFUSED' || err.code === 'EPERM' || err.code === 'EACCES';
}

async function spawnWithRetry(spawnSpec, spawnOptions, maxAttempts) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const child = spawn(spawnSpec.cmd, spawnSpec.args, spawnOptions);
      attachNoopErrorSinks(child);
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      return child;
    } catch (err) {
      lastError = err;
      const executableExists = fsSync.existsSync(spawnSpec.cmd);
      const canRetry = attempt < maxAttempts - 1
        && (isTransientSpawnError(err) || (err.code === 'ENOENT' && executableExists));
      if (!canRetry) throw err;
      await sleepMs(400);
    }
  }
  throw lastError;
}

async function spawnRuntimeWithRetry(spawnSpec, spawnOptions) {
  // A missing spawn cwd reports as a misleading `spawn <exe> ENOENT` on
  // Windows. Recreate the cwd before spawning, and probe the command so a
  // transient antivirus lock does not kill the mission either.
  ensureCwd(spawnOptions);
  await probeCommand(spawnSpec);
  // Windows can emit an unhandled 'error' on a stdio Socket immediately after
  // spawn returns. Attach no-op error sinks and retry on transient errors.
  return spawnWithRetry(spawnSpec, spawnOptions, 3);
}

async function superviseMission(options) {
  await require('./missionEnvelopeAuthority').assertRun(options.db, {
    agentId: options.agentId, runId: options.executionRun.id, mission: options.normalizedMission });
  const { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan, runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, executable } = options;
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const conscienceState = await agentConscience.loadConscienceState(db, agentId);
  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = normalizedMission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const continuousObserver = await require('./continuousExecution/observer').create({
    db, agentId, runId: executionRun.id, workspaceRoot, options: normalizedMission.continuousExecution
  });
  const { spawnCmd, spawnArgs } = resolveSpawnCommand(resolvedExecutable);
  const launcherObservation = await require('./trinityRuntimeAttestation').captureLaunch({
    normalizedMission, workspaceRoot, resolvedExecutable, spawnSpec: { cmd: spawnCmd, args: spawnArgs }
  });
  const child = await spawnRuntimeWithRetry({ cmd: spawnCmd, args: spawnArgs }, {
    cwd: workspaceRoot,
    env: buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, silentUpdates),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  child.genosDetached = process.platform !== 'win32';
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
  const ctx = { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan, runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, workspaceRoot, resolvedExecutable, child, conscienceState, state, continuousObserver };
  const emitTracked = (...args) => { return emitTrackedImpl(ctx, ...args); };
  ctx.emitTracked = emitTracked;
  ctx.handleOrchestrationDecision = handleOrchestrationDecision;
  ctx.haltRuntime = haltRuntimeImpl;
  require('./agents/workerRuntimeBudgetService').startWorkerDeadline(ctx);
  require('./missionEnvelopeAuthorityMonitor').start(ctx);
  ctx.processEventQueue = processEventQueueImpl;
  child.stdout.on('data', (chunk) => { handleStdoutData(ctx, chunk); });
  child.stderr.on('data', (chunk) => { handleStderrData(ctx, chunk); });
  child.stdin.on('error', (error) => { handleStdinError(ctx, error); });
  child.on('error', (error) => { handleChildError(ctx, error); });
  child.on('close', (code, signal) => { handleChildClose(ctx, code, signal); });
  continuousExecution.start(ctx);
  // Replay a spawn error that fired before ctx existed, and fail the mission
  // through the normal error path instead of crashing the bridge.
  if (earlyChildError) {
    handleChildError(ctx, earlyChildError);
    throw Object.assign(new Error(`Runtime spawn failed: ${earlyChildError.message}`), { code: 'AGENT_RUNTIME_SPAWN_FAILED' });
  }
  await updateAgent(agentId, 'running', normalizedMission.prompt);
  emitTracked('WORKER_RUNTIME_CAPABILITIES', 'LEASE', 'Worker runtime capabilities activated.', {
    ...buildCapabilityPayload(normalizedMission, resolvedExecutable), ...continuousExecution.capabilities(ctx)
  }, 'info', 'running');
  emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, {
    executable: resolvedExecutable,
    executionRunId: executionRun.id,
    autonomyPlan,
    replayManifest: buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord, autonomyPlan, runtimeBudget, runtimeEnvironment, workspaceRoot, resolvedExecutable })
  }, 'info', 'running');
  await applyLocalRouting(ctx);
  try { await require('./trinityRuntimeAttestation').recordLaunch(ctx, { observation: launcherObservation, pid: child.pid }); }
  catch (failure) {
    haltRuntimeImpl(ctx, 'runtime_provenance_failed', failure.message, 'Runtime launcher provenance failed.');
    throw failure;
  }
  child.stdin.end(encodeMission(buildMissionEnvelope(ctx, buildMissionIdentity(agentId, normalizedMission, dispatchedAgent), runtimeStrategyContract)));
  return { started: true, executionRun };
}

module.exports = { superviseMission, runtimeExitOutcome, buildReplayManifest,
  reportOrchestrationActionFailure, spawnRuntimeWithRetry, handleOrchestrationDecision };
