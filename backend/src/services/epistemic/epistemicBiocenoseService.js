'use strict';

/**
 * Biocénose cognitive épistémique.
 *
 * Mesure la diversité fonctionnelle réelle d'un groupe de vérificateurs
 * (et non leur simple nombre). Une monoculture cognitive — quatre modèles
 * généralistes qui se trompent ensemble — a une effective diversity ≈ 1.
 *
 * Espèces mesurées :
 *  - species richness     : nombre de types distincts
 *  - functional diversity : niches occupées (test, replay, source, proof, artifact, benchmark)
 *  - error diversity      : taux d'erreur distincts
 *  - tool diversity       : outils / stratégies distincts
 *  - provider diversity   : modèles / backends distincts
 *  - strategy diversity   : approches distinctes
 */

const DEFAULT_NICHES = Object.freeze([
  'testResult',
  'replay',
  'source',
  'proof',
  'artifact',
  'benchmark',
  'counterexample',
  'independent',
]);

function speciesRichness(reviewers = []) {
  const species = new Set(reviewers.map((r) => r.type || r.role || r.id));
  return species.size;
}

function functionalDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const niches = new Set(reviewers.map((r) => r.niche || r.type || 'unknown'));
  return niches.size / DEFAULT_NICHES.length;
}

function errorDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const errorRates = new Set(reviewers.map((r) => Math.round((r.errorRate || 0) * 10) / 10));
  return errorRates.size / reviewers.length;
}

function toolDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const tools = new Set(reviewers.flatMap((r) => r.tools || r.strategy ? [r.type] : []));
  return tools.size / reviewers.length;
}

function providerDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const providers = new Set(reviewers.map((r) => r.provider || r.model || 'unknown'));
  return providers.size / reviewers.length;
}

function strategyDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const strategies = new Set(reviewers.map((r) => {
    const s = r.strategy;
    if (Array.isArray(s)) return s.join('|');
    return s || r.type || 'unknown';
  }));
  return strategies.size / reviewers.length;
}

function effectiveDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const species = speciesRichness(reviewers);
  if (species <= 1) return 0;
  const raw = (
    functionalDiversity(reviewers) +
    errorDiversity(reviewers) +
    toolDiversity(reviewers) +
    providerDiversity(reviewers) +
    strategyDiversity(reviewers)
  ) / 5;
  return Math.min(1, raw * Math.log2(species) / Math.log2(Math.max(2, species)));
}

function isMonoculture(reviewers = [], threshold = 0.3) {
  return effectiveDiversity(reviewers) < threshold;
}

function shouldRecruit(reviewers = [], threshold = 0.3) {
  return isMonoculture(reviewers, threshold);
}

function recommendNiche(reviewers = []) {
  const occupied = new Set(reviewers.map((r) => r.niche || r.type));
  const free = DEFAULT_NICHES.filter((n) => !occupied.has(n));
  return free.length ? free[0] : null;
}

function cognitiveBiocenose(reviewers = []) {
  return {
    speciesRichness: speciesRichness(reviewers),
    functionalDiversity: functionalDiversity(reviewers),
    errorDiversity: errorDiversity(reviewers),
    toolDiversity: toolDiversity(reviewers),
    providerDiversity: providerDiversity(reviewers),
    strategyDiversity: strategyDiversity(reviewers),
    effectiveDiversity: effectiveDiversity(reviewers),
    isMonoculture: isMonoculture(reviewers),
    shouldRecruit: shouldRecruit(reviewers),
    recommendNiche: recommendNiche(reviewers),
  };
}

module.exports = {
  DEFAULT_NICHES,
  speciesRichness,
  functionalDiversity,
  errorDiversity,
  toolDiversity,
  providerDiversity,
  strategyDiversity,
  effectiveDiversity,
  isMonoculture,
  shouldRecruit,
  recommendNiche,
  cognitiveBiocenose,
};
