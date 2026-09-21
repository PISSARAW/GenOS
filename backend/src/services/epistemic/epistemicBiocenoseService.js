'use strict';

/**
 * Biocénose cognitive épistémique.
 *
 * Mesure la diversité fonctionnelle réelle d'un groupe de vérificateurs
 * (et non leur simple nombre). Une monoculture cognitive — quatre modèles
 * généralistes qui se trompent ensemble — a une effective diversity faible.
 *
 * Espèces mesurées :
 *  - species richness     : nombre de types distincts
 *  - functional diversity : niches occupées
 *  - error diversity      : patterns d'erreur distincts (pas juste taux)
 *  - tool diversity       : outils réels distincts
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
  // Mesure la diversité des patterns d'erreur, pas seulement des taux.
  // Deux verifiers qui se trompent sur les mêmes cas sont corrélés.
  if (!reviewers.length) return 0;
  const errorPatterns = new Set(reviewers.flatMap((r) => {
    const patterns = r.errorPatterns || r.errorClaims || [];
    if (Array.isArray(patterns)) return patterns.map((p) => String(p));
    return [String(r.errorRate || 0)];
  }));
  return errorPatterns.size / reviewers.length;
}

function toolDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const tools = new Set(reviewers.flatMap((r) => {
    const t = r.tools || [];
    return Array.isArray(t) ? t : [];
  }));
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

function shannonDiversity(reviewers = []) {
  // Diversité de Shannon normalisée : H / ln(N)
  // H = -Σ p_i * ln(p_i) où p_i = proportion du reviewer de type i
  if (!reviewers.length) return 0;
  const counts = {};
  for (const r of reviewers) {
    const key = r.type || r.role || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  const n = reviewers.length;
  let h = 0;
  for (const count of Object.values(counts)) {
    const p = count / n;
    if (p > 0) h -= p * Math.log(p);
  }
  const maxH = Math.log(Math.max(2, n));
  return maxH > 0 ? h / maxH : 0;
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
  return Math.min(1, raw * shannonDiversity(reviewers));
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
    shannonDiversity: shannonDiversity(reviewers),
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
  shannonDiversity,
  effectiveDiversity,
  isMonoculture,
  shouldRecruit,
  recommendNiche,
  cognitiveBiocenose,
};
