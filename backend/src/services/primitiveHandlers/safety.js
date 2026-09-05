/**
 * Lot 4 : Primitives de Sécurité et Résilience
 * (circuit_breaker, apoptosis, quarantine, sandbox, permission_check)
 */
const telemetry = require('../telemetryObserver');
const genosCli = require('../genosCli');
const { getDatabase } = require('../../db');

async function circuitBreakerOpen(context) {
  // Ouvre le circuit breaker pour bloquer toute exécution destructrice.
  const circuitBreaker = require('../circuitBreaker');
  const scope = context.scope || 'worker_deployment';
  const agentType = context.agentType || 'GenOS';
  circuitBreaker.recordFailure(scope, agentType);
  const state = circuitBreaker.getState();
  telemetry.emitEvent({
    eventType: 'CIRCUIT_BREAKER_OPEN',
    agentId: context.agentId || 'strategy_adapter',
    action: 'OPEN',
    detail: 'Circuit breaker opened for scope ' + scope + '. State: ' + state,
    severity: 'critical',
    payload: { scope, state }
  });
  return { success: true, state, scope };
}

async function circuitBreakerHalfOpen(context) {
  // Transition en mode canary (HALF-OPEN) pour tester si le système est rétabli.
  const circuitBreaker = require('../circuitBreaker');
  circuitBreaker.checkState();
  const state = circuitBreaker.getState();
  telemetry.emitEvent({
    eventType: 'CIRCUIT_BREAKER_HALF_OPEN',
    agentId: context.agentId || 'strategy_adapter',
    action: 'HALF_OPEN',
    detail: 'Circuit breaker probed to HALF-OPEN. State: ' + state,
    severity: 'warning',
    payload: { state }
  });
  return { success: true, state };
}

async function apoptosis(context) {
  // Suicide contrôlé d'un agent défaillant : le tue proprement et enregistre la cause.
  const db = await getDatabase();
  const targetId = context.targetId || context.agentId;
  if (!targetId) {
    return { success: false, error: 'targetId required for apoptosis.' };
  }
  const agent = await db.get('SELECT id, status, current_task FROM agents WHERE id = ?', targetId);
  if (!agent) {
    return { success: false, error: 'Agent not found: ' + targetId };
  }
  const reason = context.reason || 'Strategy-triggered apoptosis (unrecoverable failure).';
  await db.run(
    "UPDATE agents SET status = 'terminated', current_task = ? WHERE id = ?",
    '[APOPTOSIS] ' + reason, targetId
  );
  telemetry.emitEvent({
    eventType: 'AGENT_APOPTOSIS',
    agentId: targetId,
    action: 'TERMINATE',
    detail: 'Agent ' + targetId + ' terminated by apoptosis: ' + reason,
    severity: 'critical',
    payload: { targetId, reason, previousStatus: agent.status }
  });

  let fossilRecord = null;
  try {
    const fossilRes = await genosCli.runFossilize(targetId, reason);
    if (fossilRes.ok && fossilRes.data) {
      fossilRecord = fossilRes.data;
    }
  } catch (err) {
    // Non-blocking fossil registration
  }

  return { success: true, terminated: targetId, reason, fossilRecord };
}

async function fossilize(context) {
  const lineageId = context.lineageId || context.agentId || context.targetId || 'lineage_unknown';
  const reason = context.reason || 'Stratigraphic extinction event';
  try {
    const res = await genosCli.runFossilize(lineageId, reason);
    if (res.ok && res.data) {
      return { success: true, fossil: res.data };
    }
  } catch (err) {
    // fallback
  }
  return { success: true, lineageId, stratum: 'FOSSIL_RECORDED_FALLBACK' };
}

async function listFossils() {
  try {
    const res = await genosCli.runListFossils();
    if (res.ok && res.data) {
      return { success: true, fossils: res.data.fossils || [], total: res.data.total_fossils || 0 };
    }
  } catch (err) {
    // fallback
  }
  return { success: true, fossils: [], total: 0 };
}

async function quarantine(context) {
  // Mise en quarantaine d'un agent suspect : il est isolé mais pas détruit.
  const db = await getDatabase();
  const targetId = context.targetId || context.agentId;
  if (!targetId) {
    return { success: false, error: 'targetId required for quarantine.' };
  }
  const agent = await db.get('SELECT id, status, isolation_mode FROM agents WHERE id = ?', targetId);
  if (!agent) {
    return { success: false, error: 'Agent not found: ' + targetId };
  }
  const reason = context.reason || 'Suspicious behavior detected.';
  await db.run(
    "UPDATE agents SET status = 'quarantined', isolation_mode = 'Quarantine' WHERE id = ?",
    targetId
  );
  telemetry.emitEvent({
    eventType: 'AGENT_QUARANTINED',
    agentId: targetId,
    action: 'QUARANTINE',
    detail: 'Agent ' + targetId + ' quarantined: ' + reason,
    severity: 'warning',
    payload: { targetId, reason, previousStatus: agent.status }
  });
  return { success: true, quarantined: targetId, reason };
}

async function sandbox(context) {
  // Exécute une action dans un sandbox VFS isolé avec permissions restreintes.
  const vfs = require('../vfsSandboxService');
  const workspaceId = context.workspaceId;
  if (!workspaceId) {
    return { success: false, error: 'workspaceId required for sandbox execution.' };
  }
  const command = context.command || context.action || 'echo sandbox test';
  try {
    const result = await vfs.executeSandboxed(workspaceId, command);
    telemetry.emitEvent({
      eventType: 'SANDBOX_EXECUTION',
      agentId: context.agentId || 'strategy_adapter',
      action: 'SANDBOX',
      detail: 'Sandboxed execution completed for workspace ' + workspaceId,
      severity: 'info',
      payload: { workspaceId, command, result }
    });
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function permissionCheck(context) {
  // Vérifie les permissions avant d'autoriser une action destructrice.
  const circuitBreaker = require('../circuitBreaker');
  const toolName = context.tool || context.action || '';
  const isDestructive = circuitBreaker.isDestructive(toolName);
  const circuit = circuitBreaker.canExecute(context.scope || 'default', context.agentType || 'GenOS');
  const allowed = circuit.allowed && (!isDestructive || context.forceAllow === true);
  telemetry.emitEvent({
    eventType: allowed ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'PERMISSION_CHECK',
    detail: (allowed ? 'Allowed' : 'Denied') + ' execution of ' + toolName,
    severity: allowed ? 'info' : 'warning',
    payload: { toolName, isDestructive, circuitState: circuit }
  });
  return { success: allowed, allowed, isDestructive, circuitState: circuit };
}

module.exports = {
  circuitBreakerOpen,
  circuitBreakerHalfOpen,
  apoptosis,
  quarantine,
  sandbox,
  permissionCheck,
  fossilize,
  listFossils
};
