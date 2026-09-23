'use strict';

/**
 * RegulatoryBridgeService — contrat unique Node↔Rust (F9-F10).
 *
 * Remplace les bridges ad hoc (curiosity_hint, dopamine_bridge, ...).
 * Expose un RegulatorySnapshot versionné (spec/regulatory-snapshot.schema.json)
 * avec révision CAS. Les drives/hormones MODULENT, ne COMMANDENT jamais :
 * applyRPE ne fait qu'ajuster dopamine/cortisol/stress dans [0,1].
 */

const regulatoryState = require('./regulatoryStateService');

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function toSnapshot(agentId) {
  const inner = regulatoryState.getState(agentId);
  return {
    agentId: String(agentId),
    revision: inner.revision || 0,
    timestamp: new Date().toISOString(),
    drives: {
      energy: clamp01(inner.energy, 1),
      integrity: clamp01(inner.integrity, 1),
      curiosity: clamp01(inner.curiosity, 0.5),
      survival: clamp01(inner.survival, 0)
    },
    modulators: {
      stress: clamp01(inner.stress, 0),
      threat: clamp01(inner.threat, 0),
      dopamine: clamp01(inner.hormones?.dopamine, 0.5),
      adrenaline: clamp01(inner.hormones?.adrenaline, 0.1),
      cortisol: clamp01(inner.hormones?.cortisol, 0.1),
      oxytocin: clamp01(0.5, 0.5)
    },
    cognitive: {
      dissonance: clamp01(inner.cognitive?.uncertainty, 0.5),
      harmony: clamp01(1 - clamp01(inner.cognitive?.uncertainty, 0.5), 0.5)
    }
  };
}

function missingFields(snapshot) {
  const errors = [];
  if (!snapshot.agentId) errors.push('missing agentId');
  if (!snapshot.drives) errors.push('missing drives');
  if (!snapshot.modulators) errors.push('missing modulators');
  if (!snapshot.cognitive) errors.push('missing cognitive');
  return errors;
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { valid: false, errors: ['not_an_object'] };
  const errors = missingFields(snapshot);
  if (!Number.isInteger(snapshot.revision)) errors.push('bad revision');
  if (Number(snapshot.revision) < 0) errors.push('negative revision');
  return { valid: errors.length === 0, errors };
}

function checkRevision(current, expected) {
  const rev = Number(current?.revision ?? 0);
  return rev === Number(expected);
}

function rpeValue(rpe) {
  if (rpe && typeof rpe === 'object' && rpe.value !== undefined) return Number(rpe.value) || 0;
  return Number(rpe) || 0;
}

function applyRpe(agentId, rpe) {
  const raw = rpeValue(rpe);
  const value = clamp01((raw + 1) / 2, 0.5);
  const prev = regulatoryState.getState(agentId);
  const positive = raw > 0;
  const prevHormones = prev.hormones || {};
  const dopamine = clamp01(num(prevHormones.dopamine, 0.5) + (positive ? value * 0.1 : value * -0.05), 0.5);
  const cortisol = clamp01(num(prevHormones.cortisol, 0.1) + (positive ? -0.03 : 0.07), 0.1);
  const stress = clamp01(num(prev.stress, 0) + (positive ? -0.05 : 0.08), 0);
  return regulatoryState.updateState(agentId, {
    stress,
    hormones: { dopamine, cortisol }
  });
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function modulationWeights(snapshot) {
  const snap = snapshot || {};
  const stress = clamp01(snap.modulators?.stress, 0);
  const energy = clamp01(snap.drives?.energy, 1);
  const curiosity = clamp01(snap.drives?.curiosity, 0.5);
  const survival = clamp01(snap.drives?.survival, 0);
  return {
    exploration: clamp01(curiosity * (1 - stress) + 0.1, 0.2),
    riskTolerance: clamp01((1 - stress) * energy * (1 - survival) + 0.05, 0.1),
    latencyPreference: clamp01(snap.modulators?.adrenaline ?? 0.1, 0.1),
    conservation: clamp01((1 - energy) * 0.7 + survival * 0.5 + stress * 0.3, 0)
  };
}

module.exports = { toSnapshot, validateSnapshot, checkRevision, applyRpe, modulationWeights };
