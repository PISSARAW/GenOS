'use strict';

/**
 * Organism Homeostasis Service — homéostasie intrinsèque de l'agent.
 *
 * Contrairement à homeostasisService.js qui vérifie les invariants de MISSION,
 * ce service régule les variables propres à l'AGENT, même entre deux objectifs.
 *
 * Contraintes asymétriques (audit P1) — chaque variable a un MODE de régulation :
 *   - MIN    : la valeur ne doit pas descendre sous le seuil
 *   - MAX    : la valeur ne doit pas dépasser le seuil
 *   - RANGE  : la valeur doit rester dans [min, max]
 *   - SETPOINT : symétrique (réservé aux vraies homeostasies symétriques)
 *
 * « Aucune pression de contexte » n'est PAS une pathologie. « Énergie maximale »
 * n'est PAS une violation. L'ancien modèle setpoint symétrique flaggait les deux.
 */

const crypto = require('crypto');

const HOMEOSTASIS_AGENT_TABLE = 'organism_homeostasis';

function uuid() {
  return crypto.randomUUID();
}

/**
 * Définition canonique des contraintes — une source de vérité.
 */
const HOMEOSTATIC_CONSTRAINTS = {
  energy:         { mode: 'MIN',   min: 0.4 },
  memoryPressure: { mode: 'MAX',   max: 0.7 },
  socialState:    { mode: 'RANGE', min: 0.2, max: 0.9 },
  modelDrift:     { mode: 'MAX',   max: 0.3 },
  contextPressure:{ mode: 'MAX',   max: 0.8 },
  integrity:      { mode: 'MIN',   min: 0.8 },
  stress:         { mode: 'MAX',   max: 0.7 }
};

function checkConstraint(name, value) {
  const c = HOMEOSTATIC_CONSTRAINTS[name];
  if (!c) return null;
  if (c.mode === 'MIN') return checkMin(name, value, c.min);
  if (c.mode === 'MAX') return checkMax(name, value, c.max);
  if (c.mode === 'RANGE') return checkRange(name, value, c);
  return null;
}

function checkMin(name, value, min) {
  if (value >= min) return null;
  return {
    dimension: name,
    value,
    violation: `below_min_${min}`,
    severity: value < min / 2 ? 'critical' : 'degraded'
  };
}

function checkMax(name, value, max) {
  if (value <= max) return null;
  return {
    dimension: name,
    value,
    violation: `above_max_${max}`,
    severity: value > (max + 1) / 2 ? 'critical' : 'degraded'
  };
}

function checkRange(name, value, c) {
  if (value >= c.min && value <= c.max) return null;
  return {
    dimension: name,
    value,
    violation: `outside_${c.min}_${c.max}`,
    severity: 'degraded'
  };
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

function collectViolations(values) {
  const violations = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const v = checkConstraint(name, value);
    if (v) violations.push(v);
  }
  return violations;
}

/**
 * Évalue l'homéostasie de l'agent sur toutes ses dimensions.
 *
 * Les valeurs non fournies (`undefined`) sont neutres : aucune donnée ≠
 * violation. L'ancien comportement flaggait `contextPressure = 0` par défaut.
 */
async function evaluateAgentHomeostasis(db, agentId, options = {}) {
  await ensureAgentHomeostasisSchema(db);

  const values = {
    energy: options.energy,
    memoryPressure: options.memoryPressure,
    socialState: options.socialState,
    modelDrift: options.modelDrift,
    contextPressure: options.contextPressure,
    integrity: options.integrity,
    stress: options.stress
  };

  const violations = collectViolations(values);
  const status = computeStatus(violations);
  const state = buildState(agentId, values, status);

  await persistState(db, state);

  return { state, status, violations, violatedCount: violations.length };
}

function computeStatus(violations) {
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  if (criticalCount >= 1 || violations.length >= 3) return 'critical';
  if (violations.length >= 1) return 'degraded';
  return 'nominal';
}

function buildState(agentId, values, status) {
  return {
    id: uuid(),
    agent_id: agentId,
    energy: values.energy ?? 0.5,
    memory_pressure: values.memoryPressure ?? 0,
    social_state: values.socialState ?? 0.5,
    model_drift: values.modelDrift ?? 0,
    context_pressure: values.contextPressure ?? 0,
    integrity: values.integrity ?? 1.0,
    stress: values.stress ?? 0,
    status,
    observed_at: new Date().toISOString()
  };
}

async function persistState(db, state) {
  await db.run(
    `INSERT INTO ${HOMEOSTASIS_AGENT_TABLE}
      (id, agent_id, energy, memory_pressure, social_state, model_drift, context_pressure, integrity, stress, status, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    state.id, state.agent_id, state.energy, state.memory_pressure, state.social_state,
    state.model_drift, state.context_pressure, state.integrity, state.stress, state.status, state.observed_at
  );
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
      lines.push(`- ${v.dimension}: ${v.value} (${v.violation})`);
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
  checkConstraint,
  HOMEOSTATIC_CONSTRAINTS,
  HOMEOSTASIS_AGENT_TABLE
};
