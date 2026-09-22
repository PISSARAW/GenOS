'use strict';

/**
 * Organism Homeostasis Service — homéostasie intrinsèque de l'agent.
 *
 * Contrairement à homeostasisService.js qui vérifie les invariants de MISSION,
 * ce service régule les variables propres à l'AGENT, même entre deux objectifs.
 *
 * Variables régulées :
 *   - energy (ATP cognitif)
 *   - memory pressure (charge mémorielle)
 *   - social/reputational state
 *   - model drift (dérive du modèle LLM)
 *   - context window pressure
 *
 * L'homéostasie agentique est continue, pas seulement mission-gatée.
 */

const crypto = require('crypto');

const HOMEOSTASIS_AGENT_TABLE = 'organism_homeostasis';

function uuid() {
  return crypto.randomUUID();
}

async function ensureAgentHomeostasisSchema(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS ${HOMEOSTASIS_AGENT_TABLE} (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    energy REAL NOT NULL DEFAULT 0.5,
    memory_pressure REAL NOT NULL DEFAULT 0.0,
    social_state REAL NOT NULL DEFAULT 0.5,
    model_drift REAL NOT NULL DEFAULT 0.0,
    context_pressure REAL NOT NULL DEFAULT 0.0,
    integrity REAL NOT NULL DEFAULT 1.0,
    stress REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'nominal',
    observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (energy >= 0 AND energy <= 1),
    CHECK (memory_pressure >= 0 AND memory_pressure <= 1),
    CHECK (social_state >= 0 AND social_state <= 1),
    CHECK (model_drift >= 0 AND model_drift <= 1),
    CHECK (context_pressure >= 0 AND context_pressure <= 1),
    CHECK (integrity >= 0 AND integrity <= 1),
    CHECK (stress >= 0 AND stress <= 1)
  )`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_org_homeo_agent ON ${HOMEOSTASIS_AGENT_TABLE}(agent_id, observed_at)`);
}

/**
 * Évalue l'homéostasie de l'agent sur toutes ses dimensions.
 */
async function evaluateAgentHomeostasis(db, agentId, options = {}) {
  await ensureAgentHomeostasisSchema(db);

  const {
    energy = 0.5,
    memoryPressure = 0,
    socialState = 0.5,
    modelDrift = 0,
    contextPressure = 0,
    integrity = 1.0,
    stress = 0
  } = options;

  // Calculer le statut global
  const dimensions = {
    energy: { value: energy, target: 0.6, tolerance: 0.2 },
    memoryPressure: { value: memoryPressure, target: 0.3, tolerance: 0.3 },
    socialState: { value: socialState, target: 0.5, tolerance: 0.3 },
    modelDrift: { value: modelDrift, target: 0.1, tolerance: 0.2 },
    contextPressure: { value: contextPressure, target: 0.4, tolerance: 0.3 },
    integrity: { value: integrity, target: 0.9, tolerance: 0.15 },
    stress: { value: stress, target: 0.2, tolerance: 0.3 }
  };

  let violatedCount = 0;
  const violations = [];

  for (const [key, dim] of Object.entries(dimensions)) {
    const deviation = Math.abs(dim.value - dim.target);
    if (deviation > dim.tolerance + 1e-9) {
      violatedCount++;
      violations.push({
        dimension: key,
        value: dim.value,
        target: dim.target,
        deviation: Math.round(deviation * 100) / 100
      });
    }
  }

  let status = 'nominal';
  if (violatedCount >= 3) status = 'critical';
  else if (violatedCount >= 1) status = 'degraded';

  const state = {
    id: uuid(),
    agent_id: agentId,
    energy,
    memory_pressure: memoryPressure,
    social_state: socialState,
    model_drift: modelDrift,
    context_pressure: contextPressure,
    integrity,
    stress,
    status,
    observed_at: new Date().toISOString()
  };

  await db.run(
    `INSERT INTO ${HOMEOSTASIS_AGENT_TABLE}
      (id, agent_id, energy, memory_pressure, social_state, model_drift, context_pressure, integrity, stress, status, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.id, state.agent_id, state.energy, state.memory_pressure, state.social_state,
    state.model_drift, state.context_pressure, state.integrity, state.stress, state.status, state.observed_at
  );

  return { state, status, violations, violatedCount };
}

/**
 * Récupère le dernier état d'homéostasie d'un agent.
 */
async function getLastHomeostasis(db, agentId) {
  await ensureAgentHomeostasisSchema(db);
  const row = await db.get(
    `SELECT * FROM ${HOMEOSTASIS_AGENT_TABLE} WHERE agent_id = ? ORDER BY observed_at DESC LIMIT 1`,
    agentId
  );
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    energy: row.energy,
    memoryPressure: row.memory_pressure,
    socialState: row.social_state,
    modelDrift: row.model_drift,
    contextPressure: row.context_pressure,
    integrity: row.integrity,
    stress: row.stress,
    status: row.status,
    observedAt: row.observed_at
  };
}

/**
 * Recommande des actions correctives basées sur l'état d'homéostasie.
 */
function recommendActions(homeostasisState) {
  const actions = [];
  const s = homeostasisState.state || homeostasisState;

  if (s.energy < 0.3) actions.push({ action: 'reduce_fanout', reason: 'low energy' });
  if (s.memory_pressure > 0.7) actions.push({ action: 'consolidate_memory', reason: 'high memory pressure' });
  if (s.context_pressure > 0.8) actions.push({ action: 'compact_context', reason: 'context window saturated' });
  if (s.stress > 0.7) actions.push({ action: 'pause_and_replay', reason: 'high stress' });
  if (s.integrity < 0.5) actions.push({ action: 'quarantine_and_repair', reason: 'integrity compromised' });
  if (s.model_drift > 0.5) actions.push({ action: 'recalibrate_model', reason: 'model drift detected' });

  return actions;
}

/**
 * Génère un résumé lisible pour le prompt.
 */
function formatHomeostasisPrompt(homeostasisState) {
  const s = homeostasisState.state || homeostasisState;
  const lines = [
    `[HOMÉOSTASIE ORGANIQUE]`,
    `- Énergie : ${(s.energy * 100).toFixed(0)}%`,
    `- Pression mémorielle : ${(s.memory_pressure * 100).toFixed(0)}%`,
    `- État social : ${(s.social_state * 100).toFixed(0)}%`,
    `- Dérive modèle : ${(s.model_drift * 100).toFixed(0)}%`,
    `- Pression contexte : ${(s.context_pressure * 100).toFixed(0)}%`,
    `- Intégrité : ${(s.integrity * 100).toFixed(0)}%`,
    `- Stress : ${(s.stress * 100).toFixed(0)}%`,
    `- Statut : ${s.status}`
  ];

  if (homeostasisState.violations && homeostasisState.violations.length > 0) {
    lines.push(``, `[VIOLATIONS]`);
    for (const v of homeostasisState.violations) {
      lines.push(`- ${v.dimension}: ${v.value} (cible: ${v.target}, écart: ${v.deviation})`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  evaluateAgentHomeostasis,
  getLastHomeostasis,
  recommendActions,
  formatHomeostasisPrompt,
  ensureAgentHomeostasisSchema,
  HOMEOSTASIS_AGENT_TABLE
};
