/**
 * RegulatoryStateService — AgentRegulatoryState for GenOS agents.
 *
 * Holds drives (energy, integrity, curiosity, survival), stress/threat,
 * hormones (dopamine, cortisol, serotonin, adrenaline), and cognitive state.
 *
 * INVARIANTS:
 * - Drives MODULATE, never COMMAND (high dopamine ≠ permission to mutate)
 * - Hormones ≠ permission
 * - High curiosity can NEVER bypass an evidence gate
 * - Uncertainty CAN increase after receiving a contradiction
 */

const DEFAULT_ENERGY = 1.0;
const DEFAULT_INTEGRITY = 1.0;
const DEFAULT_CURIOSITY = 0.5;
const DEFAULT_SURVIVAL = 0.0;
const DEFAULT_STRESS = 0.0;
const DEFAULT_THREAT = 0.0;
const DEFAULT_DOPAMINE = 0.5;
const DEFAULT_CORTISOL = 0.1;
const DEFAULT_SEROTONIN = 0.5;
const DEFAULT_ADRENALINE = 0.1;
const DEFAULT_UNCERTAINTY = 0.5;
const DRIVE_THRESHOLD = 0.7;
const CURIOSITY_THRESHOLD = 0.5;
const ENERGY_THRESHOLD = 0.4;

const stateStore = new Map();

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function createDefaultSnapshot(agentId) {
  return {
    agentId: String(agentId),
    energy: DEFAULT_ENERGY,
    integrity: DEFAULT_INTEGRITY,
    curiosity: DEFAULT_CURIOSITY,
    survival: DEFAULT_SURVIVAL,
    stress: DEFAULT_STRESS,
    threat: DEFAULT_THREAT,
    hormones: {
      dopamine: DEFAULT_DOPAMINE,
      cortisol: DEFAULT_CORTISOL,
      serotonin: DEFAULT_SEROTONIN,
      adrenaline: DEFAULT_ADRENALINE
    },
    cognitive: {
      uncertainty: DEFAULT_UNCERTAINTY,
      mode: 'NORMAL'
    },
    revision: 0,
    updatedAt: new Date().toISOString()
  };
}

/**
 * getState — return the current RegulatorySnapshot for an agent.
 * @param {string} agentId
 * @returns {object} RegulatorySnapshot
 */
function getState(agentId) {
  if (!agentId) throw new Error('getState requires agentId');
  return stateStore.get(String(agentId)) || createDefaultSnapshot(agentId);
}

/**
 * updateState — patch the regulatory state, incrementing revision.
 * @param {string} agentId
 * @param {object} patch — partial state patch
 * @returns {object} updated RegulatorySnapshot
 */
function updateState(agentId, patch) {
  if (!agentId) throw new Error('updateState requires agentId');
  const prev = getState(agentId);
  const p = patch || {};
  const next = {
    ...prev,
    energy: p.energy !== undefined ? clamp01(p.energy) : prev.energy,
    integrity: p.integrity !== undefined ? clamp01(p.integrity) : prev.integrity,
    curiosity: p.curiosity !== undefined ? clamp01(p.curiosity) : prev.curiosity,
    survival: p.survival !== undefined ? clamp01(p.survival) : prev.survival,
    stress: p.stress !== undefined ? clamp01(p.stress) : prev.stress,
    threat: p.threat !== undefined ? clamp01(p.threat) : prev.threat,
    hormones: p.hormones ? { ...prev.hormones, ...sanitizeHormones(p.hormones) } : prev.hormones,
    cognitive: p.cognitive ? { ...prev.cognitive, ...p.cognitive } : prev.cognitive,
    revision: prev.revision + 1,
    updatedAt: new Date().toISOString()
  };
  next.cognitive.mode = getRegulatoryMode(next);
  stateStore.set(String(agentId), next);
  return next;
}

function sanitizeHormones(h) {
  return {
    dopamine: h.dopamine !== undefined ? clamp01(h.dopamine) : DEFAULT_DOPAMINE,
    cortisol: h.cortisol !== undefined ? clamp01(h.cortisol) : DEFAULT_CORTISOL,
    serotonin: h.serotonin !== undefined ? clamp01(h.serotonin) : DEFAULT_SEROTONIN,
    adrenaline: h.adrenaline !== undefined ? clamp01(h.adrenaline) : DEFAULT_ADRENALINE
  };
}

/**
 * computeDominantDrive — CONSERVE | RECOVER | SECURE | EXPLORE.
 * Mirrors GoalSelector::select() logic from genos-orchestrator/src/drives.rs.
 * @param {object} state
 * @returns {string} dominant drive
 */
function computeDominantDrive(state) {
  const s = state || {};
  const surv = clamp01(s.survival);
  if (surv >= DRIVE_THRESHOLD) return 'CONSERVE';
  const dis = clamp01(1 - s.integrity);
  if (dis > 0.5) return 'RECOVER';
  if (clamp01(s.threat) > 0) return 'SECURE';
  if (clamp01(s.energy) < ENERGY_THRESHOLD) return 'CONSERVE';
  if (clamp01(s.curiosity) > CURIOSITY_THRESHOLD) return 'EXPLORE';
  return 'SECURE';
}

/**
 * getRegulatoryMode — CONSERVATIVE | NORMAL | EXPLORATIVE | RECOVERY.
 * @param {object} state
 * @returns {string} regulatory mode
 */
function getRegulatoryMode(state) {
  const s = state || {};
  const stress = clamp01(s.stress);
  const surv = clamp01(s.survival);
  const energy = clamp01(s.energy);
  const uncertainty = clamp01(s.cognitive && s.cognitive.uncertainty);
  if (energy < ENERGY_THRESHOLD || surv >= DRIVE_THRESHOLD) return 'CONSERVATIVE';
  if (stress > 0.7 || uncertainty > 0.8) return 'RECOVERY';
  if (clamp01(s.curiosity) > 0.6 && stress < 0.3) return 'EXPLORATIVE';
  return 'NORMAL';
}

module.exports = {
  getState,
  updateState,
  computeDominantDrive,
  getRegulatoryMode,
  createDefaultSnapshot
};
