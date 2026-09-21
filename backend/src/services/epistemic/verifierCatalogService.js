'use strict';

/**
 * Vérificateurs spécialisés (anticorps effecteurs).
 *
 * Chaque vérificateur correspond à un epitope de preuve reconnu :
 *  - testResultVerifier     : résultat de test isolé / coverage / très limité
 *  - replayVerifier         : reproduction indépendante du cheminement
 *  - sourceVerification     : vérification de la source externe
 *  - proofVerifier          : preuve automatique / artefact reproductible
 *  - artifactVerifier       : artefact buildable / deterministic
 *  - benchmarkVerifier      : mesure de performance reproductible
 *
 * Chaque vérificateur expose une signature de stratégie exploitable par
 * clonal selection / affinity maturation.
 */

const VERIFIER_KINDS = Object.freeze([
  'testResult',
  'replay',
  'source',
  'proof',
  'artifact',
  'benchmark',
]);

// ---- stratégies par défaut ----

const DEFAULT_STRATEGIES = Object.freeze({
  testResult: {
    name: 'testResult',
    description: 'Vérifie un résultat de test : statut, couverture, assertions, limites.',
    steps: [
      'isoler le test',
      'reproduire sans contexte externe',
      'mesurer la couverture réelle',
      'chercher un comportement non couvert',
    ],
    maxParallel: 1,
  },
  replay: {
    name: 'replay',
    description: 'Reconstruit et exécute le cheminement de façon indépendante.',
    steps: [
      'extraire le contexte minimal',
      'reproduire depuis zéro',
      'comparer les états intermédiaires',
      'documenter les déviations',
    ],
    maxParallel: 2,
  },
  source: {
    name: 'source',
    description: 'Vérifie une source externe : authenticité, date, pertinence.',
    steps: [
      'localiser la source primaire',
      'vérifier la date et l auteur',
      'croiser avec une seconde source',
      'rejeter si corroboration absente',
    ],
    maxParallel: 1,
  },
  proof: {
    name: 'proof',
    description: 'Vérifie une preuve automatique ou un artefact reproductible.',
    steps: [
      'exécuter la preuve indépendamment',
      'vérifier les prérequis',
      'chercher un contre-exemple',
      'mesurer la généralité',
    ],
    maxParallel: 1,
  },
  artifact: {
    name: 'artifact',
    description: 'Vérifie un artefact buildable et déterministe.',
    steps: [
      'build isolated',
      'exécuter dans un environnement contrôlé',
      'mesurer la reproductibilité',
      'rejeter si non déterministe sans justification',
    ],
    maxParallel: 1,
  },
  benchmark: {
    name: 'benchmark',
    description: 'Mesure une performance de façon reproductible.',
    steps: [
      'fixer le protocole de mesure',
      'exécuter en conditions contrôlées',
      'estimer la variabilité',
      'rejeter les écarts inexpliqués',
    ],
    maxParallel: 1,
  },
});

// ---- signature d un vérificateur ----

function verifierSignature(type) {
  const def = DEFAULT_STRATEGIES[type];
  if (!def) {
    return {
      type,
      strategy: [],
      affinity: 0.5,
      usageCount: 0,
      successes: 0,
      failures: 0,
      lastUsed: null,
    };
  }
  return {
    type,
    strategy: def.steps.slice(),
    affinity: 0.5,
    usageCount: 0,
    successes: 0,
    failures: 0,
    lastUsed: null,
  };
}

// ---- catalogue par défaut ----

function buildCatalogEntry(kind) {
  return [kind, verifierSignature(kind)];
}

function defaultCatalog() {
  return Object.fromEntries(VERIFIER_KINDS.map(buildCatalogEntry));
}

// ---- affinité contextuelle ----

function evidenceKindHint(kind) {
  if (kind === 'test_result') return 'testResult';
  if (kind === 'replay') return 'replay';
  if (kind === 'observation' || kind === 'log') return 'source';
  if (kind === 'proof' || kind === 'reproducible_artifact') return 'proof';
  if (kind === 'artifact') return 'artifact';
  if (kind === 'benchmark') return 'benchmark';
  return null;
}

function epitopeHint(antigen) {
  const e = antigen.epitopes;
  if (!e || !e.evidence) return null;
  return evidenceKindHint(e.evidence.kind);
}

function allVerifiers(catalog) {
  return VERIFIER_KINDS.filter((k) => catalog[k]);
}

function matchingVerifiers(catalog, antigen) {
  const hint = epitopeHint(antigen);
  if (hint && catalog[hint]) return [catalog[hint]];
  return allVerifiers(catalog);
}

// ---- sélection clonale ----

function clonalFit(v, strategyBias) {
  const affinity = v.affinity * (strategyBias == null ? 1 : strategyBias(v.type));
  const fit = affinity * (v.usageCount + 1 > 0 ? v.successes / (v.usageCount + 1) : 0.5);
  return { verifier: v, fit, affinity };
}

function clonalRank(catalog, antigen, strategyBias) {
  const candidates = matchingVerifiers(catalog, antigen);
  return candidates
    .map((v) => clonalFit(v, strategyBias))
    .sort((a, b) => b.fit - a.fit);
}

function selectTopClones(catalog, antigen, opts = {}) {
  const strategyBias = opts.strategyBias || null;
  const count = opts.count || 1;
  const ranked = clonalRank(catalog, antigen, strategyBias);
  return ranked.slice(0, Math.max(1, count)).map((r) => r.verifier);
}

module.exports = {
  VERIFIER_KINDS,
  verifierSignature,
  defaultCatalog,
  epitopeHint,
  matchingVerifiers,
  clonalRank,
  selectTopClones,
};
