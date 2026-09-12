/**
 * Lot 4 : Primitives de Sécurité et Résilience
 * (circuit_breaker, apoptosis, quarantine, sandbox, permission_check)
 */
const telemetry = require('../telemetryObserver');
const genosCli = require('../genosCli');
const { getDatabase } = require('../../db');
const { releaseQuarantine, unquarantine } = require('./safetyRelease');

function controlTargetOf(context) {
  return context.targetId || context.target_id || context.target || context.agentId;
}

function controlActorOf(context) {
  return context.actorId || context.orchestratorId || context.agentId;
}

async function authorizeControlTarget(db, targetId, context) {
  const authority = require('../agentAuthorityService');
  try {
    const agent = await authority.authorizeAgentControl(db, targetId, controlActorOf(context), context.workspaceId || null);
    return { authorized: true, agent };
  } catch (error) {
    return { authorized: false, code: error.code, error: error.message };
  }
}

async function stopTargetRuntime(targetId) {
  const runtimeAdapter = require('../agentRuntimeAdapter');
  return Boolean(await runtimeAdapter.stopMission(targetId));
}

async function fossilizeTerminatedTarget(targetId, reason) {
  try {
    const fossilRes = await genosCli.runFossilize(targetId, reason);
    if (fossilRes.ok && fossilRes.data) return { fossilRecord: fossilRes.data };
    return { fossilRecord: null };
  } catch (err) {
    return { fossilRecord: null, error: `Fossilization failed: ${err.message}` };
  }
}

async function circuitBreakerOpen(context) {
  // Ouvre le circuit breaker pour bloquer toute exécution destructrice.
  const circuitBreaker = require('../circuitBreaker');
  const scope = context.scope || 'worker_deployment';
  const state = circuitBreaker.trip(scope, context.reason || 'strategy requested circuit open');
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
  const scope = context.scope || 'worker_deployment';
  const state = circuitBreaker.checkState(scope);
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
  const targetId = controlTargetOf(context);
  if (!targetId) {
    return { success: false, error: 'targetId required for apoptosis.' };
  }
  const auth = await authorizeControlTarget(db, targetId, context);
  if (!auth.authorized) {
    return { success: false, code: auth.code, error: auth.error };
  }
  const reason = context.reason || 'Strategy-triggered apoptosis (unrecoverable failure).';
  await db.run(
    "UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = ? WHERE id = ?",
    '[APOPTOSIS] ' + reason, targetId
  );
  const runtimeStopped = await stopTargetRuntime(targetId);
  telemetry.emitEvent({
    eventType: 'AGENT_APOPTOSIS',
    agentId: targetId,
    action: 'TERMINATE',
    detail: 'Agent ' + targetId + ' terminated by apoptosis: ' + reason,
    severity: 'critical',
    payload: { targetId, reason, previousStatus: auth.agent.status, runtimeStopped }
  });

  const fossil = await fossilizeTerminatedTarget(targetId, reason);
  if (fossil.error) {
    return { success: false, terminated: targetId, reason, error: fossil.error };
  }
  return { success: true, terminated: targetId, reason, fossilRecord: fossil.fossilRecord, runtimeStopped };
}

async function fossilize(context) {
  const lineageId = context.lineageId || context.agentId || context.targetId || 'lineage_unknown';
  const reason = context.reason || 'Stratigraphic extinction event';
  try {
    const res = await genosCli.runFossilize(lineageId, reason);
    if (res.ok && res.data) {
      return { success: true, fossil: res.data };
    }
    return { success: false, lineageId, error: res.error || 'Fossilization returned no record.' };
  } catch (err) {
    return { success: false, lineageId, error: `Fossilization failed: ${err.message}` };
  }
}

async function listFossils() {
  try {
    const res = await genosCli.runListFossils();
    if (res.ok && res.data) {
      return { success: true, fossils: res.data.fossils || [], total: res.data.total_fossils || 0 };
    }
    return { success: false, fossils: [], total: 0, error: res.error || 'Fossil listing returned no data.' };
  } catch (err) {
    return { success: false, fossils: [], total: 0, error: `Fossil listing failed: ${err.message}` };
  }
}

async function quarantine(context) {
  // Mise en quarantaine d'un agent suspect : il est isolé mais pas détruit.
  const db = await getDatabase();
  const targetId = controlTargetOf(context);
  if (!targetId) {
    return { success: false, error: 'targetId required for quarantine.' };
  }
  const auth = await authorizeControlTarget(db, targetId, context);
  if (!auth.authorized) {
    return { success: false, code: auth.code, error: auth.error };
  }
  const reason = context.reason || 'Suspicious behavior detected.';
  await db.run(
    "UPDATE agents SET status = 'blocked', isolation_mode = 'Quarantine', current_task = ? WHERE id = ?",
    '[QUARANTINE] ' + reason,
    targetId
  );
  const runtimeStopped = await stopTargetRuntime(targetId);
  telemetry.emitEvent({
    eventType: 'AGENT_QUARANTINED',
    agentId: targetId,
    action: 'QUARANTINE',
    detail: 'Agent ' + targetId + ' quarantined: ' + reason,
    severity: 'warning',
    payload: { targetId, reason, previousStatus: auth.agent.status, runtimeStopped }
  });
  return { success: true, quarantined: targetId, reason, runtimeStopped };
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

async function persistedToolLock(db, toolName) {
  if (!toolName) return null;
  return db.get('SELECT is_locked FROM mcp_tools WHERE name = ?', toolName);
}

function lockedToolVerdict(toolName, isDestructive) {
  return { success: false, allowed: false, isDestructive, circuitState: { allowed: false, reason: 'TOOL_LOCKED', message: `Tool '${toolName}' is manually locked in quarantine.` } };
}

function evaluateCircuitVerdict(context, toolName, isDestructive) {
  const circuitBreaker = require('../circuitBreaker');
  const scope = context.scope || 'default';
  const agentType = context.agentType || 'GenOS';
  const circuit = circuitBreaker.canExecute(toolName, agentType, scope, context.args || null);
  return { toolName, circuit, allowed: circuit.allowed && !isDestructive, isDestructive };
}

function emitPermissionTelemetry(context, verdict) {
  telemetry.emitEvent({
    eventType: verdict.allowed ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'PERMISSION_CHECK',
    detail: (verdict.allowed ? 'Allowed' : 'Denied') + ' execution of ' + verdict.toolName,
    severity: verdict.allowed ? 'info' : 'warning',
    payload: { toolName: verdict.toolName, isDestructive: verdict.isDestructive, circuitState: verdict.circuit }
  });
}

async function permissionCheck(context) {
  // Vérifie les permissions avant d'autoriser une action destructrice.
  const circuitBreaker = require('../circuitBreaker');
  const toolName = context.tool || context.action || '';
  const isDestructive = circuitBreaker.isDestructive(toolName);
  const db = await getDatabase();
  const persistedTool = await persistedToolLock(db, toolName);
  if (persistedTool?.is_locked === 1) {
    return lockedToolVerdict(toolName, isDestructive);
  }
  const verdict = evaluateCircuitVerdict(context, toolName, isDestructive);
  emitPermissionTelemetry(context, verdict);
  return { success: verdict.allowed, allowed: verdict.allowed, isDestructive, circuitState: verdict.circuit };
}

function messageSourceOf(msg) {
  const source = msg.from || msg.sender || msg.agentId || msg.source || 'agent';
  return String(source).trim();
}

function messageTargetOf(msg) {
  const target = msg.to || msg.recipient || msg.receiver || msg.target || msg.tool || 'system';
  return String(target).trim();
}

function touchGraphNode(nodes, id, field) {
  if (!nodes.has(id)) nodes.set(id, { id, sent: 0, received: 0 });
  nodes.get(id)[field] += 1;
}

function touchGraphEdge(edges, from, to) {
  const edgeKey = `${from}->${to}`;
  if (!edges.has(edgeKey)) edges.set(edgeKey, { source: from, target: to, count: 0 });
  edges.get(edgeKey).count += 1;
}

/**
 * Construit le graphe de communication orienté entre agents/outils
 */
async function messageGraph(context = {}) {
  const rawMessages = context.messages || context.turns || context.history || [];
  const nodes = new Map();
  const edges = new Map();

  for (const msg of rawMessages) {
    const from = messageSourceOf(msg);
    const to = messageTargetOf(msg);
    touchGraphNode(nodes, from, 'sent');
    touchGraphNode(nodes, to, 'received');
    touchGraphEdge(edges, from, to);
  }

  return {
    success: true,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    totalMessages: rawMessages.length
  };
}

const { cycleDetection: detectCycle } = require('./detection/cycleDetection');

/**
 * Détecte les cycles d'échange (ping-pong entre agents ou boucle répétitive d'outils)
 */
async function cycleDetection(context = {}) {
  return detectCycle(context);
}

const { diagnose, hypothesisEvidence, beliefProvenance, contradictionCheck, beliefGate } = require('./safetyHypothesis');
const { conscienceEvaluate, conscienceEureka } = require('./safetyConscience');

module.exports = {
  circuitBreakerOpen,
  circuitBreakerHalfOpen,
  apoptosis,
  quarantine,
  releaseQuarantine,
  unquarantine,
  sandbox,
  permissionCheck,
  fossilize,
  listFossils,
  messageGraph,
  cycleDetection,
  diagnose,
  hypothesisEvidence,
  conscienceEvaluate,
  conscienceEureka,
  beliefProvenance,
  contradictionCheck,
  beliefGate
};

