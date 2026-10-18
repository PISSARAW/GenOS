'use strict';

/**
 * Biocénose cognitive épistémique.
 *
 * Produit un indice descriptif de variété observée. Cet indice n'établit ni
 * l'indépendance épistémique ni une probabilité de correction.
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

const DEFAULT_DIVERSITY_POLICY = Object.freeze({
  id: 'aeis-observed-diversity-v2',
  calibrationStatus: 'uncalibrated_descriptive_index',
  minimumDistinctTypes: 2,
  minimumDistinctNiches: 2,
  minimumDistinctStrategies: 2,
  calibratedScoreThreshold: null,
});

function boundedRatio(count, total) {
  if (!total) return 0;
  return Math.min(1, count / total);
}

function distinctCount(values) {
  return new Set(values.filter((value) => value !== undefined && value !== null)).size;
}

function strategyKey(reviewer) {
  const strategy = reviewer.strategy;
  if (Array.isArray(strategy)) return strategy.join('|');
  return strategy;
}

function speciesRichness(reviewers = []) {
  const species = new Set(reviewers.map((r) => r.type || r.role || r.id));
  return species.size;
}

function functionalDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const niches = distinctCount(reviewers.map((r) => r.niche || r.type || 'unknown'));
  return boundedRatio(niches, DEFAULT_NICHES.length);
}

function errorDiversity(reviewers = []) {
  // Mesure la diversité des patterns d'erreur, pas seulement des taux.
  // Deux verifiers qui se trompent sur les mêmes cas sont corrélés.
  if (!reviewers.length) return 0;
  const errorPatterns = distinctCount(reviewers.flatMap((r) => {
    const patterns = r.errorPatterns || r.errorClaims || [];
    if (Array.isArray(patterns)) return patterns.map((p) => String(p));
    return [];
  }));
  return boundedRatio(errorPatterns, reviewers.length);
}

function toolDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const tools = distinctCount(reviewers.flatMap((r) => {
    const t = r.tools || [];
    return Array.isArray(t) ? t : [];
  }));
  return boundedRatio(tools, reviewers.length);
}

function providerDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const providers = distinctCount(reviewers.map((r) => r.provider || r.model));
  return boundedRatio(providers, reviewers.length);
}

function strategyDiversity(reviewers = []) {
  if (!reviewers.length) return 0;
  const strategies = distinctCount(reviewers.map(strategyKey));
  return boundedRatio(strategies, reviewers.length);
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
  const components = diversityComponents(reviewers);
  const values = Object.values(components);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function diversityComponents(reviewers = []) {
  return {
    species: boundedRatio(speciesRichness(reviewers), DEFAULT_NICHES.length),
    functional: functionalDiversity(reviewers),
    error: errorDiversity(reviewers),
    tool: toolDiversity(reviewers),
    provider: providerDiversity(reviewers),
    strategy: strategyDiversity(reviewers),
    balance: shannonDiversity(reviewers),
  };
}

function resolveDiversityPolicy(policy) {
  return { ...DEFAULT_DIVERSITY_POLICY, ...(policy || {}) };
}

function monocultureReasons(reviewers = [], policy) {
  const resolved = resolveDiversityPolicy(policy);
  const reasons = [];
  const types = speciesRichness(reviewers);
  const niches = distinctCount(reviewers.map((r) => r.niche || r.type || 'unknown'));
  const strategies = distinctCount(reviewers.map(strategyKey));
  if (types < resolved.minimumDistinctTypes) reasons.push('insufficient_distinct_types');
  if (niches < resolved.minimumDistinctNiches) reasons.push('insufficient_distinct_niches');
  if (strategies < resolved.minimumDistinctStrategies) reasons.push('insufficient_distinct_strategies');
  if (resolved.calibrationStatus === 'calibrated'
      && Number.isFinite(resolved.calibratedScoreThreshold)
      && effectiveDiversity(reviewers) < resolved.calibratedScoreThreshold) {
    reasons.push('below_explicit_calibrated_threshold');
  }
  return reasons;
}

function isMonoculture(reviewers = [], policy) {
  return monocultureReasons(reviewers, policy).length > 0;
}

function shouldRecruit(reviewers = [], policy) {
  return isMonoculture(reviewers, policy);
}

function recommendNiche(reviewers = []) {
  const occupied = new Set(reviewers.map((r) => r.niche || r.type));
  const free = DEFAULT_NICHES.filter((n) => !occupied.has(n));
  return free.length ? free[0] : null;
}

function cognitiveBiocenose(reviewers = [], policy) {
  const reasons = monocultureReasons(reviewers, policy);
  return {
    policy: resolveDiversityPolicy(policy),
    speciesRichness: speciesRichness(reviewers),
    functionalDiversity: functionalDiversity(reviewers),
    errorDiversity: errorDiversity(reviewers),
    toolDiversity: toolDiversity(reviewers),
    providerDiversity: providerDiversity(reviewers),
    strategyDiversity: strategyDiversity(reviewers),
    shannonDiversity: shannonDiversity(reviewers),
    effectiveDiversity: effectiveDiversity(reviewers),
    diversityComponents: diversityComponents(reviewers),
    isMonoculture: reasons.length > 0,
    monocultureReasons: reasons,
    shouldRecruit: reasons.length > 0,
    epistemicIndependenceMeasured: false,
    recommendNiche: recommendNiche(reviewers),
  };
}

module.exports = {
  DEFAULT_NICHES,
  DEFAULT_DIVERSITY_POLICY,
  speciesRichness,
  functionalDiversity,
  errorDiversity,
  toolDiversity,
  providerDiversity,
  strategyDiversity,
  shannonDiversity,
  diversityComponents,
  effectiveDiversity,
  monocultureReasons,
  isMonoculture,
  shouldRecruit,
  recommendNiche,
  cognitiveBiocenose,
};
