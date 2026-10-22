const completionContract = require('./missionCompletionContract');

const SAFE_RUNTIME_ENV = new Set([
  'PATH', 'Path', 'PATHEXT', 'ComSpec', 'SystemRoot', 'TEMP', 'TMP', 'CODEX_EXECUTABLE',
  'LANG', 'LC_ALL', 'NODE_ENV', 'LOCALAPPDATA', 'GENOS_SOLAR_API_URL',
  'GENOS_SOLAR_MODEL', 'GENOS_SOLAR_SAMPLING_TIMEOUT_MS'
]);
const SAFE_GENOS_ENV = new Set([
  'GENOS_WORKSPACE_ROOT', 'GENOS_CAPSULE_ROOT', 'GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS',
  'GENOS_DB_BACKUP_SKIP', 'GENOS_DB_BOOTSTRAP_SKIP', 'GENOS_SILENT_UPDATES', 'GENOS_MCP_SAMPLING_URL',
  'GENOS_MCP_SAMPLING_TOKEN', 'GENOS_SAMPLING_TOKEN', 'GENOS_MCP_PROVIDER',
  'GENOS_MCP_SAMPLING_TIMEOUT_MS', 'GENOS_MCP_TOOL_URL',
  'GENOS_COGNITIVE_PHENOTYPE'
]);
const SCOPED_RUNTIME_SECRETS = new Set(['GENOS_GVX_LEDGER_HMAC_SECRET', 'GENOS_TOOL_MEMBRANE_HMAC_SECRET']);

// Variables d'environnement explicitement bloquées pour le runtime enfant
const BLOCKED_RUNTIME_ENV = new Set(['HOME', 'USERPROFILE', 'HOMEPATH', 'HOMEDRIVE']);

function isSensitiveEnvironmentName(name) {
  return /(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|API)/i.test(name);
}

function isPropagatableGenosEnv(name) {
  return SAFE_GENOS_ENV.has(name) && !isSensitiveEnvironmentName(name);
}

function isAllowedRuntimeEnv(name) {
  if (SAFE_RUNTIME_ENV.has(name)) return true;
  return isPropagatableGenosEnv(name);
}

function addAllowedEnvironment(environment, source) {
  for (const [name, value] of Object.entries(source)) {
    if (BLOCKED_RUNTIME_ENV.has(name)) continue;
    if (isAllowedRuntimeEnv(name)) environment[name] = value;
  }
}

function addScopedRuntimeSecrets(environment, source) {
  for (const name of SCOPED_RUNTIME_SECRETS) {
    const value = source[name];
    if (typeof value === 'string' && Buffer.byteLength(value) >= 32) environment[name] = value;
  }
}

function buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, silentUpdates) {
  const environment = {};
  addAllowedEnvironment(environment, process.env);
  const scopedEnvironment = runtimeEnvironment || {};
  addAllowedEnvironment(environment, scopedEnvironment);
  addScopedRuntimeSecrets(environment, scopedEnvironment);
  for (const name of ['GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS', 'GENOS_DB_BACKUP_SKIP', 'GENOS_DB_BOOTSTRAP_SKIP']) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return {
    ...environment,
    GENOS_WORKSPACE_ROOT: workspaceRoot,
    GENOS_SILENT_UPDATES: silentUpdates ? 'true' : 'false'
  };
}

function fallback(value, defaultValue) {
  return value ?? defaultValue;
}

function buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord, autonomyPlan, runtimeBudget, runtimeEnvironment, workspaceRoot, resolvedExecutable }) {
  const safeEnvironment = buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, false);
  return {
    sessionId: executionRun.id,
    agentId,
    prompt: String(fallback(normalizedMission.prompt, fallback(normalizedMission.currentTask, ''))),
    role: fallback(normalizedMission.role, null),
    model: fallback(normalizedMission.localModel, fallback(normalizedMission.model, null)),
    executionRunId: executionRun.id,
    contractId: contractRecord.id,
    contractVersion: contractRecord.version,
    budget: fallback(runtimeBudget, null),
    executionPolicy: fallback(normalizedMission.executionPolicy, null),
    executionWorkspace: fallback(normalizedMission.executionWorkspace, null),
    autonomyPlan: fallback(autonomyPlan, null),
    workspaceRoot,
    executable: resolvedExecutable,
    environmentKeys: Object.keys(fallback(safeEnvironment, {})).sort()
  };
}

function isOptionsObject(value) {
  return typeof value === 'object' && value !== null;
}

function resolveSignal(options) {
  if (isOptionsObject(options)) return options.signal;
  return options;
}

function resolveStderr(options, rawStderr) {
  if (isOptionsObject(options)) return options.stderr || '';
  return rawStderr || '';
}

function resolveDomainState(rawDomain) {
  if (rawDomain === undefined) return {};
  return rawDomain;
}

function resolveExtra(options, rawDomain, rawExtra) {
  if (isOptionsObject(options) && options.domainVerdict) return options;
  return rawExtra || resolveDomainState(rawDomain) || {};
}

function resolveDomainFlags(extra) {
  const hasDomainFailure = Boolean(extra.hasDomainFailure);
  const unverified = Boolean(extra.unverified);
  const explicitFailed = extra.domainVerdict === 'failed' || hasDomainFailure;
  return { hasDomainFailure, unverified, explicitFailed,
    artifactFailure: extra.artifactFailure || null,
    completionInput: extra.completionInput || {} };
}

function topologyValidation(flags) {
  if (flags.explicitFailed) return { status: 'failed', reasons: ['agent_domain_failed'] };
  if (flags.unverified) return { status: 'partial', reasons: ['required_results_unverified'] };
  return { status: 'verified', reasons: [] };
}

function evaluateCompletion(lifecycleState, flags = {}) {
  const supplied = flags.completionInput || {};
  return completionContract.evaluate({ ...supplied, lifecycleState,
    barrierStatus: supplied.barrierStatus ?? 'complete',
    topologyValidation: supplied.topologyValidation || topologyValidation(flags) });
}

function persistedStatus(verdict) {
  if (verdict === 'succeeded') return 'completed';
  if (verdict === 'failed') return 'failed';
  if (verdict === 'interrupted') return 'terminated';
  return 'unverified';
}

function formatExitCode(code) {
  if (code === null || code === undefined) return 'unknown';
  return String(code);
}

function haltedOutcome({ termination, code, signal, stderr }) {
  const completion = evaluateCompletion('interrupted');
  return {
    status: 'blocked', verdict: completion.verdict,
    eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning',
    task: `Runtime halted: ${termination.reason}`,
    detail: `Runtime halted by ${termination.kind}: ${termination.reason}`,
    payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason,
      stderr: String(stderr).trim(), completion }
  };
}

function completedOutcome({ code, executionStatus, flags }) {
  const completion = evaluateCompletion('completed', flags);
  return {
    status: persistedStatus(completion.verdict), verdict: completion.verdict,
    eventType: completion.verdict === 'succeeded' ? 'AGENT_COMPLETED' : 'AGENT_FAILED',
    action: 'COMPLETE',
    severity: completion.verdict === 'failed' ? 'error'
      : (completion.verdict === 'succeeded' ? 'info' : 'warning'),
    task: 'Execution completed',
    detail: `Runtime completed with verdict '${completion.verdict}'.`,
    payload: { code, executionStatus, domainVerdict: completion.verdict,
      artifactFailure: flags.artifactFailure, completion }
  };
}

function failedExitOutcome({ code, signal, stderr, executionStatus }) {
  const lastError = String(stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  const completion = evaluateCompletion('failed');
  return {
    status: 'error', verdict: completion.verdict,
    eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error',
    task: `Runtime exited with code ${formatExitCode(code)}${signal ? ` (${signal})` : ''}`,
    detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`,
    payload: { code, signal, stderr: String(stderr).trim(), executionStatus,
      domainVerdict: completion.verdict, completion }
  };
}

function processExitOutcome({ code, signal, stderr, extra }) {
  const executionStatus = code === 0 ? 'exit_zero' : 'exit_nonzero';
  if (code === 0) return completedOutcome({ code, executionStatus, flags: resolveDomainFlags(extra) });
  return failedExitOutcome({ code, signal, stderr, executionStatus });
}

async function consolidateOffline(db, agentId) {
  try {
    await require('./sleepConsolidationService').consolidateAgent(db, agentId, {});
  } catch (_) {}
}

async function idleRecurrence(db, agentId) {
  try {
    await require('./idleTickService').tick(db, agentId, {});
  } catch (_) {}
}

function runtimeExitOutcome(...args) {
  const termination = args[0];
  const code = args[1];
  const options = args[2];
  const signal = resolveSignal(options);
  const stderr = resolveStderr(options, args[3]);
  const extra = resolveExtra(options, args[3], args[4]);
  if (termination) return haltedOutcome({ termination, code, signal, stderr });
  return processExitOutcome({ code, signal, stderr, extra });
}

function resolveOperatorStop(child) {
  if (child.genosStopRequested) return { kind: 'operator', reason: 'Stopped from Studio' };
  return null;
}

function isApoptosisTerminal(persistedAgent) {
  const agent = persistedAgent || {};
  if (agent.status === 'apoptosis') return true;
  return Boolean(agent.is_apoptotic);
}

function shouldEmitCloseOutcome({ terminalEventSeen, termination, operatorStop, apoptosisTerminal }) {
  if (apoptosisTerminal) return false;
  if (terminalEventSeen) return false;
  return true;
}

function buildGaragePayload(garage, workerGarage, agentId) {
  const state = garage || {};
  return {
    workerId: agentId,
    capacity: state.capacity || workerGarage.MAX_ACTIVE_WORKERS,
    occupied: state.occupied,
    available: state.available
  };
}

function runtimeObservation(outcome, code, signal) {
  return {
    status: outcome.status,
    verdict: outcome.verdict,
    code,
    signal,
    domainVerdict: outcome.payload.domainVerdict || null,
    stderr: String(outcome.payload.stderr || '').slice(-4000)
  };
}

async function finalizeExecutionWorkspace(input) {
  const workspace = await require('./gqwf/missionExecution').finalizeMissionWorkspace({
    db: input.db,
    executionRunId: input.executionRun.id,
    outcomeStatus: input.outcome.status
  });
  if (workspace) {
    const action = workspace.outcome === 'completed' ? 'INGEST_WORKSPACE' : 'DISCARD_WORKSPACE';
    input.emit(input.agentId, 'GQWF_EXECUTION_WORKSPACE_RELEASED', action,
      'GQWF execution workspace was finalized and its materialized lease was released.',
      workspace, 'info');
  }
  const worker = await require('./gqwf/workers').finalizeWorker(input.db, {
    workerId: input.agentId,
    outcomeStatus: input.outcome.status
  });
  if (!worker) return;
  const workerAction = worker.outcome === 'completed' ? 'CAPTURE_WORKER' : 'DISCARD_WORKER';
  input.emit(input.agentId, 'GQWF_WORKER_WORKSPACE_RELEASED', workerAction,
    'GQWF worker workspace was finalized and its materialized lease was released.',
    worker, 'info');
}

async function finalizeChildClose({
  db, agentId, dispatchedAgent, normalizedMission, child, code, signal, stderrBuffer,
  termination, missionDomainState, terminalEventSeen, emitTracked, executionQueue,
  workspaceLifecycle, workerGarage, emit, updateAgent, bodyActionId, executionRun, filesystemReceipt
}) {

  const operatorStop = resolveOperatorStop(child);
  const outcome = runtimeExitOutcome(termination || operatorStop, code, signal, stderrBuffer, missionDomainState);
  await require('./workerCellOutcomeBridge').observe({
    db, agentId, dispatchedAgent, normalizedMission
  }, outcome).catch((error) => console.error('[WorkerCell] Outcome persistence failed:', error.message));
  if (bodyActionId) await require('./runtimeProcessReceipt').observe({ db, agentId,
    runId: executionRun.id, actionId: bodyActionId,
    outcome: runtimeObservation(outcome, code, signal), emit });
  await consolidateOffline(db, agentId);
  await idleRecurrence(db, agentId);
  const persistedAgent = await db.get('SELECT status, is_apoptotic FROM agents WHERE id = ?', agentId);
  const apoptosisTerminal = isApoptosisTerminal(persistedAgent);
  const domainDowngradeRequired = persistedAgent.status === 'completed' && outcome.status !== 'completed';
  const shouldEmit = domainDowngradeRequired || shouldEmitCloseOutcome({ terminalEventSeen, termination, operatorStop, apoptosisTerminal });
  if (shouldEmit) {
    await updateAgent(agentId, outcome.status, outcome.task);
    emitTracked(outcome.eventType, outcome.action, outcome.detail,
      { ...outcome.payload, sourceActionId: bodyActionId || null }, outcome.severity, outcome.status);
    await executionQueue;
  }
  await db.run('UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL WHERE id = ?', agentId);
  try {
    await require('./runtimeFilesystemReceipt').finish(filesystemReceipt);
    await finalizeExecutionWorkspace({ db, executionRun, outcome, emit, agentId });
  }
  finally { await workspaceLifecycle.scheduleWorkspaceCleanup(agentId); }
  if (dispatchedAgent.execution_mode === 'worker') {
    const garage = await workerGarage.state(db, dispatchedAgent.parent_agent_id).catch(() => null);
    emit(dispatchedAgent.parent_agent_id, 'WORKER_SLOT_RELEASED', 'GARAGE', `Worker '${normalizedMission.name || dispatchedAgent.name}' released its active slot.`, buildGaragePayload(garage, workerGarage, agentId), 'info');
  }
}

module.exports = {
  SAFE_RUNTIME_ENV,
  isSensitiveEnvironmentName,
  buildRuntimeEnvironment,
  buildReplayManifest,
  runtimeExitOutcome,
  shouldEmitCloseOutcome,
  finalizeChildClose,
  runtimeObservation
};
