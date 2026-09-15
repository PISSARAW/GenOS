'use strict';

/**
 * @file axolotlStrategyHandlers.js
 * @description Handlers pour les primitives de la stratégie axolotl_regeneration.
 *
 * Primitives déclarées dans knowledgeResilienceStrategies.js :
 *   assess_regeneration, plan_regeneration, execute_regeneration, validate_equivalence
 *
 * Ces handlers font le pont entre la stratégie (sélectionnée par l'orchestrateur)
 * et le service de régénération axolotl (axolotlRegenerationService.js).
 *
 * État : Map module-level, perdu au redémarrage (documenté).
 */

const regenerationService = require('../axolotlRegenerationService');

// ── Assess Regeneration ──────────────────────────────────────────────────────

async function assessRegeneration(context = {}) {
  const { failureContext, lastSnapshot, orchestratorId } = context;

  if (!failureContext) {
    return failNoContext();
  }

  const assessment = await regenerationService.assessRegenerationNeed({
    failureContext,
    lastSnapshot
  });

  if (!assessment) {
    return makeAssessResult({
      assessFn: assessNoAction,
      orchestratorId,
      context,
      assessment
    });
  }
  return makeAssessResult({
    assessFn: assessment.needed ? assessPlanRegen : assessRestoreClassic,
    orchestratorId,
    context,
    assessment
  });
}

function failNoContext() {
  return { success: false, error: 'failureContext est requis pour assess_regeneration' };
}

function assessNoAction() {
  return { needed: false, mode: 'no_action', reason: 'Aucun besoin de régénération détecté' };
}

function assessPlanRegen() {
  return { needed: true, mode: 'plan_regeneration', reason: 'Défaillance structurelle' };
}

function assessRestoreClassic() {
  return { needed: false, mode: 'restore_classic', reason: 'Snapshot valide disponible' };
}

function makeAssessResult({ assessFn, orchestratorId, context, assessment }) {
  const r = assessFn();
  return {
    success: true,
    need_regeneration: r.needed,
    mode: r.mode,
    reason: r.reason,
    structural: (assessment || {}).structural || false,
    orchestratorId: orchestratorId || context.orchestrator_id,
    suggested_action: r.mode
  };
}

// ── Plan Regeneration ───────────────────────────────────────────────────────

async function planRegeneration(context = {}) {
  const { mission, reason, currentTopology, preferredPreservation, orchestratorId } = context;

  if (!mission && !reason) {
    return { success: false, error: 'mission ou reason est requis pour plan_regeneration' };
  }

  const plan = await regenerationService.planRegeneration({
    mission: mission || 'Régénération axolotl',
    reason: reason || 'Défaillance structurelle détectée',
    currentTopology,
    preferredPreservation
  });

  return {
    success: true,
    sessionId: plan.sessionId,
    targetStructure: plan.targetStructure,
    targetSignature: plan.targetStructure?.signature || 'unknown',
    regenerationPath: plan.regenerationPath,
    steps: plan.regenerationPath?.length || 0,
    alternativesConsidered: plan.alternativesConsidered,
    mode: 'plastique',
    orchestratorId: orchestratorId || context.orchestrator_id,
    note: plan.note
  };
}

// ── Execute Regeneration ────────────────────────────────────────────────────

async function executeRegeneration(context = {}) {
  const { sessionId, db, orchestratorId } = context;

  if (!sessionId) {
    return { success: false, error: 'sessionId est requis pour execute_regeneration' };
  }

  const result = await regenerationService.executeRegeneration({
    sessionId,
    db,
    context: { orchestratorId: orchestratorId || context.orchestrator_id }
  });

  return {
    success: result.success,
    sessionId: result.sessionId,
    newTopology: result.newTopology,
    validation: result.validation,
    preserved: result.preserved,
    status: result.success ? 'completed' : 'degraded',
    note: result.note,
    orchestratorId: orchestratorId || context.orchestrator_id
  };
}

// ── Validate Equivalence ────────────────────────────────────────────────────

async function validateEquivalence(context = {}) {
  const { topology, mission, orchestratorId } = context;

  if (!topology) {
    return { success: false, error: 'topology est requis pour validate_equivalence' };
  }

  const checks = [
    checkCriticalComponents(topology.components),
    checkNetworkConnectivity(topology.components, topology.connections),
    checkFeedbackLoop(topology.connections)
  ];

  const passed = checks.every(c => c.passed);

  return makeValidationResult({
    passed,
    checks,
    mission,
    orchestratorId,
    context,
    topology
  });
}

function checkCriticalComponents(components) {
  const critical = components?.filter(c => c.role === 'coordination' || c.role === 'processing') || [];
  return makeCheck({ name: 'composants_critiques', passed: critical.length > 0, count: critical.length });
}

function checkNetworkConnectivity(opts) {
  const { components, connections } = opts;
  if (!components || components.length === 0) return makeCheck({ name: 'connexité_réseau', passed: false, count: 0, detail: 'Aucun composant' });

  const adj = buildAdjacency(components, connections);
  const startId = components[0].id;

  if (!adj.has(startId)) {
    return makeCheck({
      name: 'connexité_réseau',
      passed: components.length === 1,
      count: components.length,
      detail: components.length === 1 ? 'Composant unique, connexité triviale' : 'Composant de départ isolé'
    });
  }

  const visited = bfsVisit(adj, startId);
  return makeCheck({
    name: 'connexité_réseau',
    passed: visited.size === components.length,
    count: visited.size,
    detail: components.length
  });
}

function buildAdjacency(components, connections) {
  const a = new Map();
  for (const c of components) a.set(c.id, new Set());
  if (connections) {
    for (const conn of connections) {
      const x = a.get(conn.from);
      const y = a.get(conn.to);
      if (x) x.add(conn.to);
      if (y) y.add(conn.from);
    }
  }
  return a;
}

function bfsVisit(adjacency, startId) {
  const visited = new Set();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const n = adjacency.get(cur);
    if (n) for (const nb of n) if (!visited.has(nb)) queue.push(nb);
  }
  return visited;
}

function checkFeedbackLoop(connections) {
  const list = connections || [];
  const hasFeedback = list.some(c => c.type === 'feedback');
  return makeCheck('boucle_rétroaction', hasFeedback, list.length, hasFeedback ? 'Connexion feedback présente' : 'Aucune connexion feedback');
}

function makeCheck(opts) {
  const { name, passed, count, detail } = opts;
  return { name, passed, detail: detail || `${count} éléments` };
}

function makeValidationResult({ passed, checks, mission, orchestratorId, context, topology }) {
  return {
    success: true,
    passed,
    checks,
    topology,
    mission: mission || 'Validation équivalence fonctionnelle',
    orchestratorId: orchestratorId || context.orchestrator_id,
    note: passed
      ? 'Topologie fonctionnellement équivalente à la mission'
      : 'Topologie avec déficits fonctionnels — mode dégradé'
  };
}

module.exports = {
  assess_regeneration: assessRegeneration,
  plan_regeneration: planRegeneration,
  execute_regeneration: executeRegeneration,
  validate_equivalence: validateEquivalence
};
