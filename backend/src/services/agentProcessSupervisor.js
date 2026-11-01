/**
 * Process supervision for one agent runtime: spawns the framed-protobuf child,
 * decodes its event stream into telemetry, guardrails, and orchestration
 * decisions, and translates the exit into a terminal agent outcome.
 */
const path = require('path');
const { encodeMission } = require('./runtimeProtocol');
const { resolveExecutable, isLocalRuntime } = require('./agentRuntimeExecutable');
const { trustedRuntimeExecutable, isDirectFileRuntime, directFileWriter } = require('./runtimeSpawnPolicy');
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
const { spawnRuntimeWithRetry } = require('./agentProcessSpawner');
const { runLocalWorker } = require('./workerEvidenceBarrierLocal');
const childTermination = require('./agentChildTerminationObserver');
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
    executionRunId: executionRun?.id || payload.executionRunId,
    contractId: payload.contractId || contractRecord?.id,
    contractVersion: payload.contractVersion || contractRecord?.version
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
  emit(ctx.agentId, 'AGENT_RUNTIME_HALT_REQUESTED', kind.toUpperCase(), detail,
    { reason, stopRequested: true, stopObserved: false, ...payload }, 'critical', 'blocked');
  terminateChild(ctx.child, isDetachedChild(ctx.child));
  return true;
}

function emitTrackedImpl(ctx, ...args) {
  const [eventType, action, detail, payload = {}, severity = 'info', status] = args;
  const eventPayload = buildTrackedEventPayload(payload, ctx.executionRun, ctx.contractRecord);
  if (eventPayload.workerId && eventPayload.workerId !== ctx.agentId) {
    eventPayload.workerId = ctx.agentId;
  }
  const guarded = continuousExecution.guard(ctx, { eventType, action, detail, payload: eventPayload, severity, status }, false);
  const event = emit(ctx.agentId, guarded.eventType, guarded.action, guarded.detail, guarded.payload, guarded.severity, guarded.status);
  require('./morphogenesis/intraEpochRoundHook').observeRuntimeEvent({
    agentId: ctx.agentId, mission: ctx.normalizedMission, event: guarded, emit
  });
  recordWorkerEvidence(ctx.normalizedMission, event);
  reportUserMilestone(ctx, event);
  const workerFailure = isWorkerFailureEvent(ctx.dispatchedAgent, eventType);
  if (workerFailure) {
    ctx.state.recoveryQueuePromise = (ctx.state.recoveryQueuePromise || Promise.resolve())
      .then(() => agentRecoveryService.queueWorkerRecovery(ctx.normalizedMission, event))
      .catch((err) => console.error('[WorkerRecovery] Durable queue write failed.', { code: err.code || 'UNKNOWN' }));
  }
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
  const trustedExecutable = trustedRuntimeExecutable(resolvedExecutable);
  if (trustedExecutable.endsWith('.cjs') || trustedExecutable.endsWith('.js')) {
    return { spawnCmd: process.execPath, spawnArgs: [trustedExecutable] };
  }
  return { spawnCmd: trustedExecutable, spawnArgs: [] };
}

function fallback(value, defaultValue) {
  return value ?? defaultValue;
}

function capturesFilesystem(bodyActionId, executable) {
  return Boolean(bodyActionId && (isLocalRuntime(executable) || isDirectFileRuntime(executable)));
}

function requiresSharedDatabase(mission, executable) {
  return Boolean(mission.modelBudgetScope && isLocalRuntime(executable));
}

function modelDatabaseEnvironment(mission, executable, databasePath) {
  if (!mission.modelBudgetScope || !databasePath || !isLocalRuntime(executable)) return {};
  return { GENOS_DB_PATH: databasePath };
}

function actorEnvironment(token, databasePath) {
  return token ? { GENOS_MCP_ACTOR_TOKEN: token, GENOS_DB_PATH: databasePath } : {};
}

function childStdio(executable) {
  return isLocalRuntime(executable) || isDirectFileRuntime(executable)
    ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'];
}

async function spawnSupervisedChild(input) {
  const { normalizedMission, resolvedExecutable, spawnCmd, spawnArgs } = input;
  try {
    const cpuResources = normalizedMission.workerContract?.resources;
    if (process.platform === 'win32' && cpuResources && Object.hasOwn(cpuResources, 'maxCpuMs')) {
      await require('./agents/workerProcessCpu').prepareProcessCpuMeter();
    }
    return await spawnRuntimeWithRetry({ cmd: spawnCmd, args: spawnArgs }, {
    cwd: input.workspaceRoot,
    env: { ...buildRuntimeEnvironment(input.runtimeEnvironment, input.workspaceRoot, input.silentUpdates),
      ...modelDatabaseEnvironment(normalizedMission, resolvedExecutable, input.mcpDbPath),
      ...actorEnvironment(input.mcpActorToken, input.mcpDbPath), ...input.reconnect.environment },
    stdio: childStdio(resolvedExecutable), detached: process.platform !== 'win32'
    });
  } catch (error) {
    if (input.bodyActionId) await require('./runtimeProcessReceipt').spawnFailed({ db: input.db, agentId: input.agentId,
      runId: input.executionRun.id, actionId: input.bodyActionId, code: error.code });
    await require('./runtimeFilesystemReceipt').fail(input.filesystemReceipt, fallback(error.code, 'SPAWN_FAILED'));
    if (input.mcpActorToken) await require('./mcpActorCapability').revoke(input.db, input.mcpActorToken);
    throw error;
  }
}

function supervisorState() {
  return { termination: null, executionQueue: Promise.resolve(),
    missionDomainState: { hasDomainFailure: false, unverified: true, domainVerdict: 'unverified' },
    eventQueue: [], maxEventQueue: Math.max(1, Number(process.env.GENOS_RUNTIME_EVENT_QUEUE_CAPACITY) || 2048),
    droppedEventCount: 0, isProcessingEvents: false, pendingTerminalStatuses: new Map(),
    terminalEventSeen: false, stdoutBuffer: Buffer.alloc(0), stderrBuffer: '', earlyChildError: null };
}

async function activateSupervision(ctx, input) {
  const { child, resolvedExecutable, executionRun, agentId, normalizedMission, dispatchedAgent } = ctx;
  child.genosDetached = process.platform !== 'win32';
  child.genosCaptureBarrier = isLocalRuntime(resolvedExecutable);
  child.genosExecutionRunId = executionRun.id;
  child.genosControlIdentity = input.controlIdentity;
  require('./runtimeControlCapability').bind(child);
  if (input.reconnect.authority) input.reconnectProvisioning.attach({
    db: ctx.db, child, identity: child.genosControlIdentity, authority: input.reconnect.authority
  });
  child.on('error', (error) => { ctx.state.earlyChildError = fallback(ctx.state.earlyChildError, error); });
  const runtimeStartedAt = new Date().toISOString();
  activeProcesses.set(agentId, child);
  await ctx.db.run('UPDATE agents SET runtime_pid = ?, runtime_started_at = ?, runtime_executable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', child.pid, runtimeStartedAt, input.spawnCmd, agentId);
  if (shouldTrackWorkspace(normalizedMission, dispatchedAgent)) {
    await workspaceLifecycle.trackWorkspace(agentId, ctx.workspaceRoot);
  }
  ctx.emitTracked = (...args) => emitTrackedImpl(ctx, ...args);
  ctx.handleOrchestrationDecision = handleOrchestrationDecision;
  ctx.haltRuntime = haltRuntimeImpl;
  require('./agents/workerRuntimeBudgetService').startWorkerDeadline(ctx);
  require('./agents/workerRuntimeBudgetService').startWorkerCpuBudget(ctx);
  require('./missionEnvelopeAuthorityMonitor').start(ctx);
  ctx.processEventQueue = processEventQueueImpl;
  child.stdout.on('data', (chunk) => { handleStdoutData(ctx, chunk); });
  if (ctx.filesystemReceipt && directFileWriter(resolvedExecutable)) {
    child.on('message', (message) => {
      require('./runtimeFilesystemReceipt').recordDirectWrite(ctx.filesystemReceipt, message,
        directFileWriter(resolvedExecutable));
    });
  }
  child.stderr.on('data', (chunk) => { handleStderrData(ctx, chunk); });
  child.stdin.on('error', (error) => { handleStdinError(ctx, error); });
  child.on('error', (error) => { handleChildError(ctx, error); });
  childTermination.attach(child, (code, signal) => { handleChildClose(ctx, code, signal); });
}

async function dispatchRuntime(ctx, input) {
  const { child, normalizedMission, resolvedExecutable, executionRun, agentId } = ctx;
  continuousExecution.start(ctx);
  await require('./habitatEnforcementRuntimeBridge').arm(ctx, input.habitat);
  if (ctx.state.earlyChildError) {
    handleChildError(ctx, ctx.state.earlyChildError);
    throw Object.assign(new Error(`Runtime spawn failed: ${ctx.state.earlyChildError.message}`), { code: 'AGENT_RUNTIME_SPAWN_FAILED' });
  }
  await updateAgent(agentId, 'running', normalizedMission.prompt);
  ctx.emitTracked('WORKER_RUNTIME_CAPABILITIES', 'LEASE', 'Worker runtime capabilities activated.', {
    ...buildCapabilityPayload(normalizedMission, resolvedExecutable), ...continuousExecution.capabilities(ctx)
  }, 'info', 'running');
  ctx.emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, {
    executable: resolvedExecutable,
    executionRunId: executionRun.id,
    sourceActionId: ctx.bodyActionId,
    autonomyPlan: ctx.autonomyPlan,
    replayManifest: buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord: ctx.contractRecord,
      autonomyPlan: ctx.autonomyPlan, runtimeBudget: ctx.runtimeBudget, runtimeEnvironment: ctx.runtimeEnvironment,
      workspaceRoot: ctx.workspaceRoot, resolvedExecutable })
  }, 'info', 'running');
  await applyLocalRouting(ctx);
  try { await require('./trinityRuntimeAttestation').recordLaunch(ctx, { observation: input.launcherObservation, pid: child.pid }); }
  catch (failure) {
    haltRuntimeImpl(ctx, 'runtime_provenance_failed', failure.message, 'Runtime launcher provenance failed.');
    throw failure;
  }
  const runtimeEnvelope = buildMissionEnvelope(ctx,
    buildMissionIdentity(agentId, normalizedMission, ctx.dispatchedAgent), input.runtimeStrategyContract);
  const encodedMission = encodeMission(runtimeEnvelope);
  ctx.emitTracked('AGENT_RUNTIME_INPUT_MEASURED', 'MEASURE_RUNTIME_INPUT',
    'Measured the encoded runtime mission before dispatch.', { byteLength: Buffer.byteLength(encodedMission),
      componentBytes: Object.fromEntries(Object.entries(runtimeEnvelope)
        .map(([key, value]) => [key, Buffer.byteLength(String(value ?? ''))])) }, 'info', 'running');
  child.stdin.end(encodedMission);
}

async function prepareRuntimeLaunch(options, authority) {
  const { db, agentId, normalizedMission, dispatchedAgent, executionRun, executable } = options;
  const workspaceRoot = fallback(normalizedMission.workspaceRoot,
    fallback(process.env.GENOS_WORKSPACE_ROOT, path.resolve(__dirname, '../../..')));
  const controlTenant = dispatchedAgent.workspace_id
    ? await db.get('SELECT organization_id, project_id FROM workspaces WHERE id = ?', dispatchedAgent.workspace_id) : null;
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const continuousObserver = await require('./continuousExecution/observer').create({
    db, agentId, runId: executionRun.id, workspaceRoot, options: normalizedMission.continuousExecution });
  const { spawnCmd, spawnArgs } = resolveSpawnCommand(resolvedExecutable);
  const launcherObservation = await require('./trinityRuntimeAttestation').captureLaunch({
    normalizedMission, workspaceRoot, resolvedExecutable, spawnSpec: { cmd: spawnCmd, args: spawnArgs } });
  const bodyActionId = authority.status === 'authorized'
    ? await require('./runtimeProcessReceipt').predict({ db, agentId, runId: executionRun.id, executable: resolvedExecutable }) : null;
  const filesystemReceipt = capturesFilesystem(bodyActionId, resolvedExecutable)
    ? await require('./runtimeFilesystemReceipt').begin({ db, agentId, runId: executionRun.id, workspaceRoot }) : null;
  const mcpDbPath = require('../db').databasePath();
  if (requiresSharedDatabase(normalizedMission, resolvedExecutable) && !mcpDbPath) {
    throw Object.assign(new Error('Local model budget scope requires the shared server database.'), { code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID' });
  }
  const mcpActorToken = bodyActionId && mcpDbPath
    ? await require('./mcpActorCapability').issue(db, { agentId, runId: executionRun.id, workspaceRoot }) : null;
  const controlIdentity = Object.freeze({ workerId: agentId,
    missionId: fallback(normalizedMission.missionId, ''),
    episodeId: fallback(normalizedMission.episodeId, fallback(normalizedMission.missionScope?.episodeId, '')),
    threadId: fallback(normalizedMission.threadId, fallback(normalizedMission.missionScope?.threadId, '')),
    organizationId: fallback(controlTenant?.organization_id, ''), projectId: fallback(controlTenant?.project_id, '') });
  const reconnectProvisioning = require('./runtimeControlReconnectProvisioning');
  const reconnect = reconnectProvisioning.prepare(isLocalRuntime(resolvedExecutable), controlIdentity);
  return { ...options, workspaceRoot, controlTenant, resolvedExecutable, continuousObserver,
    spawnCmd, spawnArgs, launcherObservation, bodyActionId, filesystemReceipt, mcpDbPath,
    mcpActorToken, controlIdentity, reconnectProvisioning, reconnect };
}

async function superviseMission(options) {
  const authority = await require('./missionEnvelopeAuthority').assertRun(options.db, {
    agentId: options.agentId, runId: options.executionRun.id, mission: options.normalizedMission,
    verifyInputs: true, executable: options.executable });
  const launch = await prepareRuntimeLaunch(options, authority);
  const { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan,
    runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, executable, workspaceRoot,
    controlTenant, resolvedExecutable, continuousObserver, spawnCmd, spawnArgs, launcherObservation,
    bodyActionId, filesystemReceipt, mcpDbPath, mcpActorToken, reconnectProvisioning, reconnect } = launch;
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = fallback(normalizedMission.strategyContract, {});
  const conscienceState = await agentConscience.loadConscienceState(db, agentId);
  const spawnInput = { db, agentId, normalizedMission, executionRun, resolvedExecutable, spawnCmd, spawnArgs,
    workspaceRoot, runtimeEnvironment, silentUpdates, mcpDbPath, mcpActorToken, bodyActionId, filesystemReceipt, reconnect };
  let child;
  try {
    child = await spawnSupervisedChild(spawnInput);
  } catch (spawnError) {
    // Sur Windows, le spawn de processus enfant avec pipes stdin/stdout peut
    // échouer avec EPIPE (broken pipe) car le pipe est fermé avant que l'enfant
    // n'ait pu le lire. Basculer sur l'exécution in-process via runLocalWorker,
    // qui contacte le modèle local (ollama) directement sans processus enfant.
    if (process.platform === 'win32') {
      process.stderr.write('[agentProcessSupervisor] Worker child spawn failed on Windows (' +
        (spawnError?.code || spawnError?.message || 'unknown') +
        '); falling back to in-process local-model execution.\n');
      return runLocalWorker(db, normalizedMission, executionRun);
    }
    throw spawnError;
  }
  const state = supervisorState();
  const ctx = { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan,
    runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, workspaceRoot, resolvedExecutable, child,
    conscienceState, state, continuousObserver, bodyActionId, filesystemReceipt, mcpActorToken, controlTenant };
  await activateSupervision(ctx, { reconnect, reconnectProvisioning, controlIdentity, spawnCmd });
  await dispatchRuntime(ctx, { habitat: options.habitat, launcherObservation, runtimeStrategyContract });
  return { started: true, executionRun };
}
module.exports = { superviseMission, runtimeExitOutcome, buildReplayManifest,
  reportOrchestrationActionFailure, spawnRuntimeWithRetry, handleOrchestrationDecision };
