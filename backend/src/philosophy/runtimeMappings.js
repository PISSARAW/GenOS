'use strict';

/**
 * Documentation-only links between political concepts and real GenOS
 * mechanisms. A mapping is never an authorization or a policy decision.
 */

const RUNTIME_MAPPINGS = Object.freeze({
  'politics.regime-classification': {
    kind: 'service',
    target: 'strategySelector',
    note: 'Compare les stratégies et leurs contraintes ; ne classifie pas un régime réel.',
  },
  'politics.legitimacy': {
    kind: 'service',
    target: 'agentEvidenceService',
    note: 'La justification et la preuve rendent une décision auditable ; elles ne la rendent pas légitime par elles-mêmes.',
  },
  'politics.social-contract': {
    kind: 'service',
    target: 'strategyContractService',
    note: 'Les contrats de stratégie représentent des engagements techniques, pas un consentement politique.',
  },
  'politics.liberty-authority': {
    kind: 'service',
    target: 'toolLeasePolicy',
    note: 'Les leases bornent l’autorité d’exécution et ne modélisent pas toute la liberté.',
  },
  'politics.separation-of-powers': {
    kind: 'analogy',
    target: 'orchestration-validation-boundary',
    note: 'Séparation conceptuelle entre orchestration, exécution et validation ; pas une constitution du runtime.',
  },
  'politics.democratic-participation': {
    kind: 'analogy',
    target: 'multi-agent-deliberation',
    note: 'La pluralité de propositions ne constitue pas une démocratie sans procédure de décision explicite.',
  },
  'politics.pluralism': {
    kind: 'service',
    target: 'strategySelector',
    note: 'La diversité des stratégies expose plusieurs perspectives sans garantir un pluralisme social.',
  },
  'politics.civil-disobedience': {
    kind: 'service',
    target: 'workerEvidenceBarrier',
    note: 'Un refus bloqué par une barrière ou un lease reste une contrainte de sûreté, pas automatiquement une désobéissance civile.',
  },
  'politics.security-liberty-surveillance': {
    kind: 'service',
    target: 'circuitBreaker',
    note: 'Le circuit breaker limite l’exécution en situation de risque ; il ne justifie ni collecte ni surveillance.',
  },
});

function mappingForConcept(conceptId) {
  const mapping = RUNTIME_MAPPINGS[String(conceptId || '').trim()];
  return mapping ? { ...mapping } : null;
}

function listMappings() {
  return Object.entries(RUNTIME_MAPPINGS).map(([concept, mapping]) => ({ concept, ...mapping }));
}

module.exports = { RUNTIME_MAPPINGS, mappingForConcept, listMappings };
