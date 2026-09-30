'use strict';

/**
 * @file axolotlRegenerationService.js
 * @description Régénération fonctionnelle inspirée de l'axolotl (Ambystoma mexicanum).
 *
 * Contraste avec le recovery classique :
 * - Recovery classique = restaurer un état connu et identique
 * - Axolotl = reconstruire un équivalent fonctionnel avec une structure différente
 *
 * État interne : Map module-level, perdu au redémarrage (documenté).
 */

const {
  compareTopologyAlternatives,
  selectTargetStructure,
  buildRegenerationPath,
  buildTopologyComponents,
  checkConnectivity
} = require('./axolotlRegenerationHelpers');

const regenerationSessions = new Map();
let adaptivePersister = null;

function setAdaptivePersister(persister) {
  adaptivePersister = persister;
}

async function persistSessions() {
  if (adaptivePersister?.setRegenerationSessions) {
    await adaptivePersister.setRegenerationSessions(regenerationSessions);
  }
}

async function assessRegenerationNeed({ failureContext, lastSnapshot }) {
  if (!failureContext) return null;
  const { severity, structural } = failureContext;
  if (!structural && (severity !== 'critical' && severity !== 'high')) return null;
  if (lastSnapshot && lastSnapshot.valid && !structural) {
    return { needed: false, reason: 'Snapshot valide disponible', mode: 'restore_classic' };
  }
  return {
    needed: true,
    reason: structural ? 'Défaillance structurelle' : 'Sévérité critique — last-resort',
    mode: structural ? 'functional_regeneration' : 'emergency_regeneration',
    structural
  };
}

async function planRegeneration({ mission, reason, currentTopology, preferredPreservation }) {
  const ctxId = `regen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    id: ctxId,
    mission: mission || 'Axolotl regeneration',
    reason: reason || 'Défaillance structurelle',
    createdAt: new Date().toISOString(),
    status: 'planning',
    preserved: preferredPreservation || [],
    targetStructure: null,
    regenerationPath: null
  };
  regenerationSessions.set(ctxId, session);
  await persistSessions();
  const alternatives = compareTopologyAlternatives(currentTopology);
  const target = selectTargetStructure(currentTopology, alternatives);
  session.targetStructure = target;
  session.regenerationPath = buildRegenerationPath(currentTopology, target, session.preserved);
  session.status = 'planned';
  return {
    sessionId: ctxId,
    targetStructure: target,
    regenerationPath: session.regenerationPath,
    alternativesConsidered: alternatives.length,
    note: 'Structure cible différente de l\'origine — régénération fonctionnelle'
  };
}

async function executeRegeneration({ sessionId, db, context = {} }) {
  const session = regenerationSessions.get(sessionId);
  if (!session) return { success: false, error: `Session ${sessionId} introuvable` };
  session.status = 'in_progress';
  session.startedAt = new Date().toISOString();
  await persistSessions();
  const preserved = await preserveCriticalState(session, db);
  const newTopology = buildNewTopology(session.targetStructure, preserved);
  const validation = validateFunctionalEquivalence(newTopology, session.mission);
  session.status = validation.passed ? 'completed' : 'degraded';
  session.completedAt = new Date().toISOString();
  let worker = null;
  if (validation.passed && db) {
    if (!context.orchestratorId) {
      throw Object.assign(new Error('A parent orchestrator is required to create the regenerated worker.'), { code: 'REGENERATION_ORCHESTRATOR_REQUIRED' });
    }
    worker = await createRegeneratedWorker({ db, session, context });
    session.workerId = worker.agentId;
    session.mission = worker.mission;
  }
  await persistSessions();
  return {
    success: validation.passed,
    sessionId,
    newTopology,
    validation,
    preserved: preserved.length,
    worker,
    note: validation.passed
      ? 'Régénération fonctionnelle terminée'
      : 'Régénération partielle — mode dégradé'
  };
}

async function createRegeneratedWorker({ db, session, context }) {
  const crypto = require('crypto');
  const agentId = `worker_regen_${crypto.randomUUID()}`;
  const mission = {
    id: `mission_regen_${session.id}`,
    task: `Operate regenerated ${session.targetStructure.id} topology`,
    objective: session.mission,
    prompt: `Continue the independent mission: ${session.mission}. Use regenerated topology ${session.targetStructure.signature}; report evidence for functional-equivalence checks.`,
    workspaceRoot: context.workspaceRoot,
    executionBudget: context.executionBudget || { tokens: 4000, events: 5, costUsd: 0.25 },
    autonomousOrchestration: false
  };
  const parent = await db.get('SELECT workspace_id, fleet_id, model_tier, language, isolation_mode FROM agents WHERE id = ?', context.orchestratorId);
  if (!parent) throw Object.assign(new Error('Regeneration orchestrator not found.'), { code: 'REGENERATION_ORCHESTRATOR_NOT_FOUND' });
  await db.run(`INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id,
    model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
    VALUES (?, ?, 'regeneration_worker', 'idle', 'GenOS', 'worker', ?, ?, ?, ?, ?, ?, 'regeneration', ?, ?)` ,
    agentId, `Regenerate · ${session.targetStructure.id}`, parent.workspace_id, parent.fleet_id,
    parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch',
    context.orchestratorId, mission.prompt, mission.prompt);
  await require('./agentRuntimeAdapter').startMission({
    ...mission, agentId, orchestratorAgentId: context.orchestratorId,
    workspaceId: parent.workspace_id, fleetId: parent.fleet_id, modelTier: parent.model_tier,
    role: 'regeneration_worker', workerAssignment: { role: 'regeneration_worker', label: session.targetStructure.id }
  });
  return { agentId, mission };
}

function listRegenerationSessions() {
  return [...regenerationSessions.entries()].map(([id, s]) => ({ id, ...s }));
}

function getRegenerationSession(sessionId) {
  return regenerationSessions.get(sessionId) || null;
}

async function preserveCriticalState(session, db) {
  if (!db) return [];
  try {
    const rows = await db.all(
      `SELECT id, content_hash FROM agent_genomes WHERE status = 'active' ORDER BY created_at DESC LIMIT 5`
    );
    return rows.map(r => ({ kind: 'genome', ref: r.id, hash: r.content_hash }));
  } catch (_) {
    return [];
  }
}

function buildNewTopology(targetStructure, preserved) {
  const { components, connections } = buildTopologyComponents(targetStructure, preserved);
  return {
    regenerated: true,
    targetSignature: targetStructure.signature,
    structure: targetStructure.id,
    preservedComponents: preserved.length,
    components,
    connections,
    regeneratedAt: new Date().toISOString()
  };
}

function validateFunctionalEquivalence(newTopology) {
  const hasCritical = newTopology.components.some(
    c => c.role === 'coordination' || c.role === 'processing'
  );
  const isConnected = checkConnectivity(newTopology);
  const hasFeedback = newTopology.connections.some(c => c.type === 'feedback');
  const checks = [
    { name: 'composants_critiques', passed: Boolean(hasCritical) },
    { name: 'connexité_réseau', passed: isConnected },
    { name: 'boucle_rétroaction', passed: hasFeedback }
  ];
  const allPassed = checks.every(c => c.passed);
  return { passed: allPassed, checks, note: allPassed ? 'Équivalent fonctionnel' : 'Mode dégradé' };
}

module.exports = {
  assessRegenerationNeed,
  planRegeneration,
  executeRegeneration,
  listRegenerationSessions,
  getRegenerationSession,
  setAdaptivePersister
};
