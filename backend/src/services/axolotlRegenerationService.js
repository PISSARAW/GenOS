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

async function executeRegeneration({ sessionId, db }) {
  const session = regenerationSessions.get(sessionId);
  if (!session) return { success: false, error: `Session ${sessionId} introuvable` };
  session.status = 'in_progress';
  session.startedAt = new Date().toISOString();
  const preserved = await preserveCriticalState(session, db);
  const newTopology = buildNewTopology(session.targetStructure, preserved);
  const validation = validateFunctionalEquivalence(newTopology, session.mission);
  session.status = validation.passed ? 'completed' : 'degraded';
  session.completedAt = new Date().toISOString();
  regenerationSessions.delete(sessionId);
  return {
    success: validation.passed,
    sessionId,
    newTopology,
    validation,
    preserved: preserved.length,
    note: validation.passed
      ? 'Régénération fonctionnelle terminée'
      : 'Régénération partielle — mode dégradé'
  };
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
  getRegenerationSession
};
