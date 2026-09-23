'use strict';

/**
 * AttentionResolver (G2) : que dois-je observer, avec quel capteur,
 * à quelle résolution, sous budget d'attention ?
 * Score = gainInformationnelAttendu / coût.
 */

const { getSensor } = require('./sensorRegistryService');

function scoreCandidate(cand) {
  const gain = Number(cand.expectedGain) || 0;
  const sensor = getSensor(cand.sensorId);
  const cost = sensor ? Math.max(1, sensor.cost) : 5;
  return gain / cost;
}

function rankCandidates(cands) {
  return [...cands].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
}

function selectFocus(opts) {
  const o = opts || {};
  const cands = Array.isArray(o.candidates) ? o.candidates : [];
  const budget = Number.isFinite(o.budget) ? o.budget : 10;
  const ranked = rankCandidates(cands);
  const selected = [];
  let spent = 0;
  for (const c of ranked) {
    const sensor = getSensor(c.sensorId);
    const cost = sensor ? sensor.cost : 5;
    if (spent + cost > budget) continue;
    spent += cost;
    selected.push({ ...c, score: scoreCandidate(c), cost });
  }
  return { selected, spent, budget, ranked: ranked.map((c) => c.sensorId) };
}

module.exports = { selectFocus, scoreCandidate };
