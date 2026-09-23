'use strict';

/**
 * ClinicalState Service — per-agent medical runtime.
 *
 * Tracks vitals, cell-cycle state, plasmid load, pathogen burden,
 * and the accumulated iatrogenic load of prior therapies. Provides
 * the ClinicalState consumed by AgentExpressionContext.
 */

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const CELL_CYCLE_STATES = ['G0', 'G1', 'S', 'G2', 'M', 'arrested', 'senescent'];

function clinicalStateFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    vitals: safeParseJson(row.vitals_json, {}),
    immuneTiter: clamp01(row.immune_titer, 1.0),
    inflammatoryIndex: clamp01(row.inflammatory_index, 0.0),
    cellCycleState: row.cell_cycle_state || 'G0',
    plasmidLoad: clamp01(row.plasmid_load, 0.0),
    pathogenBurden: clamp01(row.pathogen_burden, 0.0),
    iatrogenicLoad: clamp01(row.iatrogenic_load, 0.0),
    wellnessScore: clamp01(row.wellness_score, 1.0),
    observedAt: row.observed_at,
    updatedAt: row.updated_at,
  };
}

function safeParseJson(text, fallback) {
  try { return JSON.parse(text || '{}'); } catch (_) { return fallback; }
}

function computeWellness(state) {
  const stressPenalty = clamp01(state.vitals.stress) * 0.3;
  const burdenPenalty = state.pathogenBurden * 0.25 + state.inflammatoryIndex * 0.2 + state.iatrogenicLoad * 0.15 + state.plasmidLoad * 0.1;
  const base = clamp01(state.vitals.cognitiveIntegrity, 0.8) * 0.3 + clamp01(state.vitals.budgetRatio, 1.0) * 0.2 + clamp01(state.immuneTiter, 1.0) * 0.2;
  return clamp01(base - stressPenalty - burdenPenalty + 0.3, 0.5);
}

async function initClinicalState(db, agentId) {
  if (!db || !agentId) return null;
  const id = `clinical_${agentId}_${Date.now()}`;
  const vitals = JSON.stringify({ cognitiveIntegrity: 1.0, stress: 0, energy: 1.0, budgetRatio: 1.0, dissonance: 0, apoptosisRisk: 0 });
  await db.run(
    `INSERT INTO clinical_states (id, agent_id, vitals_json, cell_cycle_state, wellness_score)
     VALUES (?, ?, ?, 'G0', 1.0)`,
    id, agentId, vitals
  );
  return getClinicalState(db, agentId);
}

async function getClinicalState(db, agentId) {
  if (!db || !agentId) return null;
  const row = await db.get('SELECT * FROM clinical_states WHERE agent_id = ?', agentId);
  return clinicalStateFromRow(row);
}

function buildVitals(context) {
  return {
    cognitiveIntegrity: clamp01(context.cognitiveIntegrity, 0.8),
    stress: clamp01(context.stress),
    energy: clamp01(context.energy, 0.8),
    budgetRatio: clamp01(context.budgetRatio, 1.0),
    dissonance: clamp01(context.dissonance),
    apoptosisRisk: clamp01(context.apoptosisRisk),
  };
}

function resolveCellCycle(context, existing) {
  return CELL_CYCLE_STATES.includes(context.cellCycleState) ? context.cellCycleState : existing;
}

async function refreshClinicalState(db, agentId, context = {}) {
  const existing = await getClinicalState(db, agentId);
  if (!existing) return initClinicalState(db, agentId);

  const vitals = buildVitals(context);
  const plasmidLoad = clamp01(context.plasmidLoad, 0.0);
  const pathogenBurden = clamp01(context.pathogenBurden, 0.0);
  const inflammatoryIndex = clamp01(context.inflammatoryIndex, 0.0);
  const immuneTiter = clamp01(context.immuneTiter, 1.0);
  const cellCycleState = resolveCellCycle(context, existing.cellCycleState);
  const iatrogenicLoad = clamp01(existing.iatrogenicLoad + clamp01(context.iatrogenicDelta, 0), 0.0);

  const newState = { ...existing, vitals, plasmidLoad, pathogenBurden, inflammatoryIndex, immuneTiter, cellCycleState, iatrogenicLoad };
  newState.wellnessScore = computeWellness(newState);

  await db.run(
    `UPDATE clinical_states SET vitals_json = ?, immune_titer = ?, inflammatory_index = ?,
     cell_cycle_state = ?, plasmid_load = ?, pathogen_burden = ?,
     iatrogenic_load = ?, wellness_score = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`,
    JSON.stringify(vitals), immuneTiter, inflammatoryIndex,
    cellCycleState, plasmidLoad, pathogenBurden, iatrogenicLoad, newState.wellnessScore, agentId
  );
  return getClinicalState(db, agentId);
}

async function recordImmuneEvent(db, agentId, opts) {
  const { clinicalStateId, eventType, eventData = {}, severity = 'info' } = opts || {};
  if (!db || !agentId || !eventType) return null;
  const id = `imrev_${agentId}_${Date.now()}`;
  await db.run(
    `INSERT INTO immune_events (id, agent_id, clinical_state_id, event_type, event_json, severity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, agentId, clinicalStateId || null, eventType, JSON.stringify(eventData), severity
  );
  return { id, agentId, clinicalStateId, eventType, eventData, severity };
}

async function getRecentImmuneEvents(db, agentId, limit = 20) {
  if (!db || !agentId) return [];
  return db.all(
    'SELECT * FROM immune_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
    agentId, limit
  );
}

function getClinicalSummary(state) {
  if (!state) return null;
  const status = state.wellnessScore > 0.7 ? 'healthy' : state.wellnessScore > 0.4 ? 'compromised' : state.wellnessScore > 0.2 ? 'critical' : 'moribund';
  return {
    wellnessScore: state.wellnessScore, status, cellCycleState: state.cellCycleState,
    iatrogenicLoad: state.iatrogenicLoad, pathogenBurden: state.pathogenBurden,
    plasmidLoad: state.plasmidLoad, inflammatoryIndex: state.inflammatoryIndex, immuneTiter: state.immuneTiter,
  };
}

module.exports = {
  CELL_CYCLE_STATES, initClinicalState, getClinicalState, refreshClinicalState,
  computeWellness, recordImmuneEvent, getRecentImmuneEvents, getClinicalSummary,
};