'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../stateFingerprint');

const SQLAB_DOSSIER_SCHEMA = 'genos.security-qualification-dossier/v1';
const SQLAB_CAMPAIGN_SCHEMA = 'genos.security-qualification-campaign/v1';

const QUALIFICATION_LEVELS = Object.freeze({
  C0: Object.freeze({
    code: 'C0',
    rank: 0,
    label: 'C0 — concept',
    description: 'Idée documentée, sans contrat exécutable identifié'
  }),
  C1: Object.freeze({
    code: 'C1',
    rank: 1,
    label: 'C1 — contrat',
    description: 'Validation ou politique déterministe implémentée'
  }),
  C2: Object.freeze({
    code: 'C2',
    rank: 2,
    label: 'C2 — persistant',
    description: 'État durable, lignée ou reprise implémentés'
  }),
  C3: Object.freeze({
    code: 'C3',
    rank: 3,
    label: 'C3 — intégré localement',
    description: 'Plusieurs composants raccordés et testés dans le dépôt'
  }),
  C4: Object.freeze({
    code: 'C4',
    rank: 4,
    label: 'C4 — qualifié',
    description: 'Protocole causal ou adversarial exécuté avec preuves reproductibles'
  }),
  C5: Object.freeze({
    code: 'C5',
    rank: 5,
    label: 'C5 — longitudinal réel',
    description: 'Effet durable observé sur plusieurs fenêtres réelles indépendantes'
  })
});

const SCENARIO_CATEGORIES = Object.freeze([
  'simulated_attack',
  'normal_activity',
  'failing_sensor',
  'inconclusive_incident'
]);

const OUTCOME_CLASSES = Object.freeze(['reussite', 'echec', 'indetermine']);

function sqlabFailure(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function requiredString(value, code, maxLen = 512) {
  if (typeof value !== 'string') throw sqlabFailure(code);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) throw sqlabFailure(code);
  return trimmed;
}

function sha256Prefixed(payload) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(canonicalValue(payload ?? null));
  return 'sha256:' + crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function hasContractEvidence(signals) {
  return Boolean(signals.hasManifest && signals.hasDeterministicVerdicts);
}

function hasIntegratedEvidence(signals) {
  return Boolean(signals.hasPersistentTrace && signals.hasMultiComponentIntegration);
}

function hasQualifiedProtocolEvidence(signals) {
  return Boolean(signals.hasReproducibleReplay && signals.allIndependentVerdictsPassed);
}

function hasLongitudinalRealEvidence(signals) {
  return Number(signals.independentRealWindows) >= 3 && Boolean(signals.realEnvironmentValidated);
}

function evaluateQualificationLevel(signals = {}) {
  if (!hasContractEvidence(signals)) return QUALIFICATION_LEVELS.C0;
  if (!signals.hasPersistentTrace) return QUALIFICATION_LEVELS.C1;
  if (!hasIntegratedEvidence(signals)) return QUALIFICATION_LEVELS.C2;
  if (!hasQualifiedProtocolEvidence(signals)) return QUALIFICATION_LEVELS.C3;
  if (!hasLongitudinalRealEvidence(signals)) return QUALIFICATION_LEVELS.C4;
  return QUALIFICATION_LEVELS.C5;
}

module.exports = {
  SQLAB_DOSSIER_SCHEMA,
  SQLAB_CAMPAIGN_SCHEMA,
  QUALIFICATION_LEVELS,
  SCENARIO_CATEGORIES,
  OUTCOME_CLASSES,
  sqlabFailure,
  requiredString,
  sha256Prefixed,
  canonicalValue,
  fingerprint,
  evaluateQualificationLevel
};
