'use strict';

const CHANGE_FACTORS = Object.freeze(['models', 'repository', 'provider', 'toolset', 'successRate']);

// Half-life par défaut des priors morphologiques : 30 jours (30 * 86400000 ms, ADR 0720).
// Un mois constitue un cycle d'observation suffisant pour qu'un prior perde de
// sa confiance sans être purgé prématurément, tout en évitant l'accumulation
// indéfinie d'entrées obsolètes. Révisable via prior.halfLifeMs.
const DEFAULT_HALF_LIFE_MS = 30 * 86400000;

function assessPriorFreshness(prior = {}, current = {}, now = Date.now()) {
  const staleReasons = CHANGE_FACTORS.filter((key) => prior[key] !== undefined && current[key] !== undefined && prior[key] !== current[key]);
  const ageMs = Math.max(0, now - (prior.recordedAt || now));
  const decay = Math.exp(-ageMs / (prior.halfLifeMs || DEFAULT_HALF_LIFE_MS));
  const confidence = Math.max(0, Math.min(1, decay * (1 - staleReasons.length * 0.2)));
  return { confidence, staleReasons, reusable: confidence >= 0.35 };
}

module.exports = { CHANGE_FACTORS, DEFAULT_HALF_LIFE_MS, assessPriorFreshness };
