'use strict';

/**
 * Signaux de danger : patterns + scores.
 * C'est le dictionnaire des reconnaissance innée.
 */

const DANGER_SIGNALS = {
  SELF_VERIFICATION: {
    pattern: 'SELF_VERIFICATION',
    danger: 0.9,
    category: 'provenance',
    description: 'L\'agent vérifie sa propre affirmation.',
  },
  EMPTY_EVIDENCE: {
    pattern: 'EMPTY_EVIDENCE',
    danger: 0.75,
    category: 'evidence',
    description: 'Aucune preuve fournie.',
  },
  NO_DIGEST: {
    pattern: 'NO_DIGEST',
    danger: 0.6,
    category: 'evidence',
    description: 'Preuve sans empreinte vérifiable.',
  },
  NO_PROVENANCE: {
    pattern: 'NO_PROVENANCE',
    category: 'provenance',
    danger: 0.65,
    description: 'Absence de provenance source.',
  },
  STALE_SOURCE: {
    pattern: 'STALE_SOURCE',
    danger: 0.55,
    category: 'provenance',
    description: 'Source périmée (> 72 jours).',
  },
  SELF_CONTAINED_CYCLE: {
    pattern: 'SELF_CONTAINED_CYCLE',
    danger: 0.6,
    category: 'dependance',
    description: 'Cycle de dépendances auto-référentiel.',
  },
  INVALID_TEST_RESULT: {
    pattern: 'INVALID_TEST_RESULT',
    danger: 0.7,
    category: 'test',
    description: 'Résultat de test en échec.',
  },
  TEST_RESULT_NO_COVERAGE: {
    pattern: 'TEST_RESULT_NO_COVERAGE',
    danger: 0.45,
    category: 'test',
    description: 'Résultat de test sans couverture.',
  },
  OVERCONSTRAINT: {
    pattern: 'OVERCONSTRAINT',
    danger: 0.35,
    category: 'hypotheses',
    description: 'Trop d\'hypothèses (> 8).',
  },
};

function listPatterns() {
  return Object.values(DANGER_SIGNALS);
}

function byCategory(category) {
  return Object.values(DANGER_SIGNALS).filter((s) => s.category === category);
}

function signalByName(name) {
  return DANGER_SIGNALS[name] || null;
}

module.exports = {
  DANGER_SIGNALS,
  listPatterns,
  byCategory,
  signalByName,
};
