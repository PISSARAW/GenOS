/**
 * Provider-neutral bridge between Studio deployments and a real GenOS agent runtime.
 * The configured executable receives one JSON mission on stdin and emits NDJSON events
 * on stdout. Each event is forwarded to the Studio telemetry bus and agent state.
 */
const { spawn } = require('child_process');
const path = require('path');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const { encodeMission, decodeEvents } = require('./runtimeProtocol');

const activeProcesses = new Map();

function configuredExecutable() {
  return String(process.env.GENOS_AGENT_EXECUTOR || '').trim();
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

async function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  const normalizedMission = { ...mission, agentId };
  const executable = configuredExecutable();
  if (!executable) {
    emit(agentId, 'AGENT_RUNTIME_WAITING', 'WAIT', 'No GENOS_AGENT_EXECUTOR is configured; mission remains queued.', { adapter: 'none' }, 'warning', 'idle');
    return { started: false, reason: 'missing_executor' };
  }
  if (activeProcesses.has(agentId)) return { started: true, duplicate: true };

  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const child = spawn(executable, [], { cwd: workspaceRoot, env: { ...process.env, GENOS_WORKSPACE_ROOT: workspaceRoot }, stdio: ['pipe', 'pipe', 'pipe'] });
  activeProcesses.set(agentId, child);

  let stdoutBuffer = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    stdoutBuffer = decodeEvents(stdoutBuffer, (event) => {
      let payload = {};
      try { payload = event.payloadJson ? JSON.parse(event.payloadJson) : {}; } catch { payload = { raw: event.payloadJson }; }
      const nextStatus = event.status || (event.eventType === 'AGENT_COMPLETED' ? 'idle' : undefined);
      if (nextStatus || event.currentTask) updateAgent(agentId, nextStatus, event.currentTask).catch(() => {});
      emit(agentId, event.eventType || 'AGENT_STEP', event.action || 'EXECUTE', event.detail || '', payload, event.severity || 'info', nextStatus);
    });
  });
  child.stderr.on('data', (chunk) => emit(agentId, 'AGENT_RUNTIME_LOG', 'STDERR', chunk.toString().trim(), {}, 'warning'));
  child.on('error', async (error) => {
    activeProcesses.delete(agentId);
    await updateAgent(agentId, 'error', error.message);
    emit(agentId, 'AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  });
  child.on('close', async (code, signal) => {
    activeProcesses.delete(agentId);
    if (code === 0) {
      await updateAgent(agentId, 'idle', 'Execution completed');
      emit(agentId, 'AGENT_COMPLETED', 'COMPLETE', 'Runtime completed successfully.', { code }, 'info', 'idle');
    } else {
      await updateAgent(agentId, 'error', `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`);
      emit(agentId, 'AGENT_FAILED', 'ERROR', `Runtime exited unsuccessfully.`, { code, signal }, 'error', 'error');
    }
  });
  await updateAgent(agentId, 'running', mission.prompt);
  emit(agentId, 'AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${executable}.`, { executable }, 'info', 'running');
  child.stdin.end(encodeMission({
    agentId,
    name: normalizedMission.name || '',
    role: normalizedMission.role || '',
    prompt: normalizedMission.prompt || normalizedMission.currentTask || '',
    modelTier: normalizedMission.modelTier || '',
    workspaceRoot,
    workspaceIsolation: normalizedMission.workspaceIsolation || '',
    agentType: normalizedMission.agentType || ''
  }));
  return { started: true };
}

function stopMission(agentId) {
  const child = activeProcesses.get(agentId);
  if (!child) return false;
  child.kill('SIGTERM');
  return true;
}

module.exports = { startMission, stopMission, configuredExecutable };
