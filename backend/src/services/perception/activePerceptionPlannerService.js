'use strict';

/**
 * ActivePerceptionPlanner (G3) : perception active, pas lecture passive.
 * unknown -> observations possibles -> gain attendu -> probe -> update.
 */

const { sensorsFor } = require('./sensorRegistryService');
const { selectFocus } = require('./attentionResolverService');

const PROBE_SEQUENCE = ['probe_system', 'observe_response', 'infer_hidden_structure', 'adapt_next_action'];

function planProbes(opts) {
  const o = opts || {};
  const unknowns = Array.isArray(o.unknowns) ? o.unknowns : [];
  const sensors = sensorsFor({ capabilities: o.capabilities, domain: o.domain });
  const cands = buildCandidates(unknowns, sensors);
  const focus = selectFocus({ candidates: cands, budget: o.budget });
  return { probes: focus.selected, spent: focus.spent, sequence: PROBE_SEQUENCE };
}

function buildCandidates(unknowns, sensors) {
  const cands = [];
  for (const u of unknowns) {
    for (const s of sensors) {
      cands.push({ sensorId: s.id, target: u.topic || u.id || 'unknown', expectedGain: gainFor(u, s) });
    }
  }
  return cands;
}

function gainFor(unknown, sensor) {
  const base = Number(unknown.severity === 'high' ? 0.8 : 0.5) || 0.5;
  return base * (sensor.evidenceQuality || 0.5);
}

module.exports = { planProbes, PROBE_SEQUENCE };
