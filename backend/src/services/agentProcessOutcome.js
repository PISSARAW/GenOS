const SAFE_RUNTIME_ENV = new Set([
  'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'TEMP', 'TMP', 'CODEX_EXECUTABLE',
  'LANG', 'LC_ALL', 'NODE_ENV', 'LOCALAPPDATA', 'GENOS_SOLAR_API_URL',
  'GENOS_SOLAR_MODEL', 'GENOS_SOLAR_SAMPLING_TIMEOUT_MS'
]);
const SAFE_GENOS_ENV = new Set([
  'GENOS_WORKSPACE_ROOT', 'GENOS_CAPSULE_ROOT', 'GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS',
  'GENOS_DB_BACKUP_SKIP', 'GENOS_SILENT_UPDATES', 'GENOS_MCP_SAMPLING_URL',
  'GENOS_MCP_SAMPLING_TOKEN', 'GENOS_SAMPLING_TOKEN', 'GENOS_MCP_PROVIDER',
  'GENOS_MCP_SAMPLING_TIMEOUT_MS', 'GENOS_MCP_TOOL_URL',
  'GENOS_COGNITIVE_PHENOTYPE'
]);

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

function buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, silentUpdates) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    // Bloquer les variables sensibles au profil utilisateur
    if (BLOCKED_RUNTIME_ENV.has(name)) continue;
    // Propager uniquement les variables sécurisées (filtre sensible sur GENOS)
    if (isAllowedRuntimeEnv(name)) {
      environment[name] = value;
    }
  }
  for (const [name, value] of Object.entries(runtimeEnvironment || {})) {
    if (BLOCKED_RUNTIME_ENV.has(name)) continue;
    if (isAllowedRuntimeEnv(name)) environment[name] = value;
  }
  for (const name of ['GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS', 'GENOS_DB_BACKUP_SKIP']) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return {
    ...environment,
    GENOS_WORKSPACE_ROOT: workspaceRoot,
    GENOS_SILENT_UPDATES: silentUpdates ? 'true' : 'false'
  };
}

function buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord, autonomyPlan, runtimeBudget, runtimeEnvironment, workspaceRoot, resolvedExecutable }) {
  const safeEnvironment = buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, false);
  return {
    sessionId: executionRun.id,
    agentId,
    prompt: String(normalizedMission.prompt || normalizedMission.currentTask || ''),
    role: normalizedMission.role || null,
    model: normalizedMission.localModel || normalizedMission.model || null,
    executionRunId: executionRun.id,
    contractId: contractRecord.id,
    contractVersion: contractRecord.version,
    budget: runtimeBudget || null,
    executionPolicy: normalizedMission.executionPolicy || null,
    autonomyPlan: autonomyPlan || null,
    workspaceRoot,
    executable: resolvedExecutable,
    environmentKeys: Object.keys(safeEnvironment || {}).sort()
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
  return { hasDomainFailure, unverified, explicitFailed };
}

function resolveDomainVerdict(flags) {
  if (flags.explicitFailed) return 'failed';
  if (flags.unverified) return 'unverified';
  return 'completed';
}

function formatExitCode(code) {
  if (code === null || code === undefined) return 'unknown';
  return String(code);
}

function haltedOutcome({ termination, code, signal, stderr }) {
  return {
    status: 'blocked', eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning',
    task: `Runtime halted: ${termination.reason}`,
    detail: `Runtime halted by ${termination.kind}: ${termination.reason}`,
    payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason, stderr: String(stderr).trim() }
  };
}

function completedOutcome({ code, executionStatus, flags }) {
  const domainVerdict = resolveDomainVerdict(flags);
  return {
    status: flags.explicitFailed ? 'failed' : (flags.unverified ? 'unverified' : 'completed'),
    eventType: flags.explicitFailed ? 'AGENT_FAILED' : 'AGENT_COMPLETED',
    action: 'COMPLETE',
    severity: flags.explicitFailed ? 'error' : (flags.unverified ? 'warning' : 'info'),
    task: 'Execution completed',
    detail: `Runtime completed (process: success, domain: ${domainVerdict}).`,
    payload: { code, executionStatus, domainVerdict }
  };
}

function failedExitOutcome({ code, signal, stderr, executionStatus }) {
  const lastError = String(stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  return {
    status: 'error', eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error',
    task: `Runtime exited with code ${formatExitCode(code)}${signal ? ` (${signal})` : ''}`,
    detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`,
    payload: { code, signal, stderr: String(stderr).trim(), executionStatus, domainVerdict: 'failed' }
  };
}

function processExitOutcome({ code, signal, stderr, extra }) {
  const executionStatus = code === 0 ? 'exit_zero' : 'exit_nonzero';
  if (code === 0) return completedOutcome({ code, executionStatus, flags: resolveDomainFlags(extra) });
  return failedExitOutcome({ code, signal, stderr, executionStatus });
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
  if (!terminalEventSeen) return true;
  if (termination) return true;
  return Boolean(operatorStop);
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

async function finalizeChildClose({
  db, agentId, dispatchedAgent, normalizedMission, child, code, signal, stderrBuffer,
  termination, missionDomainState, terminalEventSeen, emitTracked, executionQueue,
  workspaceLifecycle, workerGarage, emit, updateAgent
}) {
  await db.run('UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL WHERE id = ?', agentId);
  await workspaceLifecycle.scheduleWorkspaceCleanup(agentId);
  const operatorStop = resolveOperatorStop(child);
  const outcome = runtimeExitOutcome(termination || operatorStop, code, signal, stderrBuffer, missionDomainState);
  const persistedAgent = await db.get('SELECT status, is_apoptotic FROM agents WHERE id = ?', agentId);
  const apoptosisTerminal = isApoptosisTerminal(persistedAgent);
  const domainDowngradeRequired = persistedAgent.status === 'completed' && outcome.status === 'unverified';
  const shouldEmit = domainDowngradeRequired || shouldEmitCloseOutcome({ terminalEventSeen, termination, operatorStop, apoptosisTerminal });
  if (shouldEmit) {
    await updateAgent(agentId, outcome.status, outcome.task);
    emitTracked(outcome.eventType, outcome.action, outcome.detail, outcome.payload, outcome.severity, outcome.status);
    await executionQueue;
  }
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
  finalizeChildClose
};
