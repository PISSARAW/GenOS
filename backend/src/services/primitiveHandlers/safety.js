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
  const authority = require('../agentAuthorityService');
  let agent;
  try { agent = await authority.authorizeAgentControl(db, targetId, context.actorId || context.orchestratorId || context.agentId, context.workspaceId || null); }
  catch (error) { return { success: false, code: error.code, error: error.message }; }
  const reason = context.reason || 'Strategy-triggered apoptosis (unrecoverable failure).';
  await db.run(
    "UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = ? WHERE id = ?",
    '[APOPTOSIS] ' + reason, targetId
  );
  const runtimeAdapter = require('../agentRuntimeAdapter');
  const runtimeStopped = Boolean(runtimeAdapter.stopMission(targetId));
  telemetry.emitEvent({
    eventType: 'AGENT_APOPTOSIS',
    agentId: targetId,
    action: 'TERMINATE',
    detail: 'Agent ' + targetId + ' terminated by apoptosis: ' + reason,
    severity: 'critical',
    payload: { targetId, reason, previousStatus: agent.status, runtimeStopped }
  });

  let fossilRecord = null;
  try {
    const fossilRes = await genosCli.runFossilize(targetId, reason);
    if (fossilRes.ok && fossilRes.data) {
      fossilRecord = fossilRes.data;
    }
  } catch (err) {
    return { success: false, terminated: targetId, reason, error: `Fossilization failed: ${err.message}` };
  }
  return { success: true, terminated: targetId, reason, fossilRecord, runtimeStopped };
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
  const targetId = context.targetId || context.agentId;
  if (!targetId) {
    return { success: false, error: 'targetId required for quarantine.' };
  }
  const authority = require('../agentAuthorityService');
  let agent;
  try { agent = await authority.authorizeAgentControl(db, targetId, context.actorId || context.orchestratorId || context.agentId, context.workspaceId || null); }
  catch (error) { return { success: false, code: error.code, error: error.message }; }
  const reason = context.reason || 'Suspicious behavior detected.';
  await db.run(
    "UPDATE agents SET status = 'blocked', isolation_mode = 'Quarantine', current_task = ? WHERE id = ?",
    '[QUARANTINE] ' + reason,
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
  const allowed = circuit.allowed && !isDestructive;
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

/**
 * Construit le graphe de communication orienté entre agents/outils
 */
async function messageGraph(context = {}) {
  const rawMessages = context.messages || context.turns || context.history || [];
  const nodes = new Map();
  const edges = new Map();

  for (const msg of rawMessages) {
    const from = String(msg.from || msg.sender || msg.agentId || msg.source || 'agent').trim();
    const to = String(msg.to || msg.recipient || msg.receiver || msg.target || msg.tool || 'system').trim();
    if (!nodes.has(from)) nodes.set(from, { id: from, sent: 0, received: 0 });
    if (!nodes.has(to)) nodes.set(to, { id: to, sent: 0, received: 0 });
    nodes.get(from).sent++;
    nodes.get(to).received++;

    const edgeKey = `${from}->${to}`;
    if (!edges.has(edgeKey)) {
      edges.set(edgeKey, { source: from, target: to, count: 0 });
    }
    edges.get(edgeKey).count++;
  }

  return {
    success: true,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    totalMessages: rawMessages.length
  };
}

/**
 * Détecte les cycles d'échange (ping-pong entre agents ou boucle répétitive d'outils)
 */
async function cycleDetection(context = {}) {
  const rawMessages = context.messages || context.turns || context.history || [];
  const maxRepeats = Number.isInteger(context.maxRepeats) ? context.maxRepeats : 2;

  let hasCycle = false;
  let cycleParticipants = [];
  let loopType = 'none';
  let detectedCycle = null;

  // 1. Détection séquentielle temporelle
  const sequence = rawMessages.map(m => {
    if (typeof m === 'string') return m;
    const actor = m.from || m.sender || m.agentId || m.action || m.tool || 'unknown';
    const target = m.to || m.recipient || m.tool || '';
    return target ? `${actor}->${target}` : actor;
  });

  if (sequence.length >= 2) {
    for (let period = 1; period <= Math.min(4, Math.floor(sequence.length / 2)); period++) {
      let repeated = 0;
      for (let i = sequence.length - 1; i >= period; i -= period) {
        let match = true;
        for (let k = 0; k < period; k++) {
          if (sequence[i - k] !== sequence[i - k - period]) {
            match = false;
            break;
          }
        }
        if (match) repeated++;
        else break;
      }
      if (repeated >= maxRepeats) {
        hasCycle = true;
        detectedCycle = sequence.slice(sequence.length - period);
        cycleParticipants = [...new Set(detectedCycle)];
        loopType = period === 1 ? 'repetitive_action' : 'agent_ping_pong';
        break;
      }
    }
  }

  // 2. Détection par graphe d'adjacence orienté (DFS)
  if (!hasCycle && rawMessages.length >= 2) {
    const adj = new Map();
    for (const msg of rawMessages) {
      const from = String(msg.from || msg.sender || msg.agentId || 'A').trim();
      const to = String(msg.to || msg.recipient || msg.target || 'B').trim();
      if (from && to && from !== to) {
        if (!adj.has(from)) adj.set(from, new Set());
        adj.get(from).add(to);
      }
    }

    const visited = new Set();
    const recStack = new Set();

    function dfs(node, path = []) {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adj.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path])) return true;
        } else if (recStack.has(neighbor)) {
          hasCycle = true;
          loopType = 'agent_ping_pong';
          const cycleStart = path.indexOf(neighbor);
          cycleParticipants = cycleStart >= 0 ? path.slice(cycleStart) : [neighbor, node];
          return true;
        }
      }

      recStack.delete(node);
      return false;
    }

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        if (dfs(node, [])) break;
      }
    }
  }

  let budgetPenalized = 0;
  if (hasCycle) {
    try {
      const db = await getDatabase();
      const targetAgentId = context.agentId || context.targetId || (cycleParticipants.length === 1 ? cycleParticipants[0] : null);
      if (targetAgentId) {
        await db.run(
          "UPDATE agents SET cognitive_budget = MAX(0, COALESCE(cognitive_budget, 100) - 15) WHERE id = ?",
          targetAgentId
        );
        budgetPenalized = 15;
      }
    } catch (_) {}

    telemetry.emitEvent({
      eventType: 'COMMUNICATION_CYCLE_DETECTED',
      agentId: context.agentId || context.orchestratorId || 'strategy_adapter',
      action: 'BREAK_LOOP',
      detail: `Cycle detected in agent communication (${loopType}): ${cycleParticipants.join(' <-> ')}`,
      severity: 'warning',
      payload: { loopType, cycleParticipants, detectedCycle, budgetPenalized }
    });
  }

  return {
    success: true,
    hasCycle,
    action: hasCycle ? 'BREAK_LOOP' : 'CONTINUE',
    intervention: hasCycle,
    loopType,
    cycleParticipants,
    detectedCycle,
    budgetPenalized,
    recommendation: hasCycle ? 'Break communication loop: mandate external decision or inject novel evidence' : 'No cycle detected'
  };
}

/**
 * Diagnostic de cause racine générant des hypothèses falsifiables
 */
async function diagnose(context = {}) {
  const task = context.task || context.incident || context.prompt || 'System incident';
  const error = context.error || context.failure || context.detail || '';
  const hypotheses = Array.isArray(context.hypotheses) ? context.hypotheses : [
    { id: 'hyp-1', statement: `Issue caused by state invalidation during "${String(task).slice(0, 50)}"`, falsified: false, confidence: 0.7 },
    { id: 'hyp-2', statement: `Resource exhaustion or concurrency collision: ${String(error).slice(0, 50)}`, falsified: false, confidence: 0.5 },
    { id: 'hyp-3', statement: 'Contract precondition or boundary violation', falsified: false, confidence: 0.4 }
  ];

  telemetry.emitEvent({
    eventType: 'INCIDENT_DIAGNOSIS_GENERATED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'DIAGNOSE',
    detail: `Generated ${hypotheses.length} falsifiable hypotheses for: ${String(task).slice(0, 60)}`,
    severity: 'info',
    payload: { task, error, hypotheses }
  });

  return {
    success: true,
    task,
    error,
    hypothesisCount: hypotheses.length,
    hypotheses
  };
}

/**
 * Confrontation des hypothèses aux preuves empiriques et falsification
 */
async function hypothesisEvidence(context = {}) {
  const rawHypotheses = context.hypotheses || [];
  const evidence = context.evidence || context.testResults || context.tests || [];

  const evaluated = rawHypotheses.map(hyp => {
    const item = typeof hyp === 'string' ? { id: `hyp_${Math.random()}`, statement: hyp, confidence: 0.5 } : { ...hyp };
    const contradicts = evidence.some(e => {
      const text = String(e.statement || e.detail || e.output || e).toLowerCase();
      const hypText = (item.statement || '').toLowerCase();
      const explicitFalsified = e.falsifies === item.id || e.refutes === item.id || (e.status === 'success' && e.provesNot === item.id);
      if (explicitFalsified) return true;
      const words = hypText.split(/\s+/).filter(w => w.length > 3 && !['issue', 'caused', 'error', 'failed', 'during'].includes(w));
      const mentionsComponent = words.some(w => text.includes(w));
      const confirmsHealthy = text.includes('passed') || text.includes('no error') || text.includes('success') || text.includes('healthy') || text.includes('clean');
      return mentionsComponent && confirmsHealthy;
    });

    return {
      ...item,
      falsified: item.falsified === true || contradicts,
      confidence: (item.falsified === true || contradicts) ? 0.0 : (item.confidence || 0.6)
    };
  });

  const retained = evaluated.filter(h => !h.falsified);
  const falsified = evaluated.filter(h => h.falsified);

  return {
    success: true,
    totalHypotheses: evaluated.length,
    retainedCount: retained.length,
    falsifiedCount: falsified.length,
    retainedHypotheses: retained,
    falsifiedHypotheses: falsified
  };
}

/**
 * Évalue la conscience cognitive de l'agent (dissonance, harmonie, seuil apoptotique).
 */
async function conscienceEvaluate(context = {}) {
  const agentConscience = require('../agentConscienceService');
  const db = await getDatabase();
  const agentId = context.targetId || context.agentId || 'strategy_agent';
  const state = await agentConscience.loadConscienceState(db, agentId);

  const evalResult = agentConscience.evaluateBranch(state, {
    errorsInLoop: context.errorsInLoop || 0,
    progressScore: context.progressScore || 0,
    cognitiveHealth: context.cognitiveHealth || {}
  });

  try {
    await agentConscience.persistConscienceState(db, agentId, state, { reason: 'primitive_evaluate' });
  } catch (_) {}

  telemetry.emitEvent({
    eventType: 'CONSCIENCE_EVALUATED',
    agentId,
    action: 'EVALUATE',
    detail: `Conscience state: dissonance=${state.dissonanceLevel.toFixed(1)}, harmony=${evalResult.harmony}%, apoptotic=${evalResult.apoptoticTriggered}`,
    severity: evalResult.apoptoticTriggered ? 'critical' : 'info',
    payload: { state, evalResult }
  });

  return {
    success: true,
    agentId,
    dissonanceLevel: state.dissonanceLevel,
    harmony: evalResult.harmony,
    isApoptotic: state.isApoptotic,
    apoptoticTriggered: evalResult.apoptoticTriggered,
    currentBudget: state.currentBudget,
    maxDissonanceThreshold: state.maxDissonanceThreshold
  };
}

/**
 * Enregistre un événement Eurêka pour l'agent (réduit la dissonance de 50%).
 */
async function conscienceEureka(context = {}) {
  const agentConscience = require('../agentConscienceService');
  const db = await getDatabase();
  const agentId = context.targetId || context.agentId || 'strategy_agent';
  const state = await agentConscience.loadConscienceState(db, agentId);

  agentConscience.triggerEureka(state);
  try {
    await agentConscience.persistConscienceState(db, agentId, state, { reason: 'primitive_eureka' });
  } catch (_) {}

  telemetry.emitEvent({
    eventType: 'COGNITIVE_EUREKA',
    agentId,
    action: 'EUREKA',
    detail: `Eureka moment registered! Dissonance halved to ${state.dissonanceLevel.toFixed(1)}.`,
    severity: 'info',
    payload: { state }
  });

  return {
    success: true,
    agentId,
    dissonanceLevel: state.dissonanceLevel,
    eurekaMoments: state.eurekaMoments,
    currentBudget: state.currentBudget
  };
}

module.exports = {
  circuitBreakerOpen,
  circuitBreakerHalfOpen,
  apoptosis,
  quarantine,
  sandbox,
  permissionCheck,
  fossilize,
  listFossils,
  messageGraph,
  cycleDetection,
  diagnose,
  hypothesisEvidence,
  conscienceEvaluate,
  conscienceEureka
};
