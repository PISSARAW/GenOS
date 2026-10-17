'use strict';

const manifest = require('../../../../spec/morphogenesis-universal-proof-v1.json');
const REASONS = Object.freeze({
  explicitDomainMetadata: 'missing_external_domain_metadata',
  externalDomainCoverage: 'insufficient_external_domains',
  balancedExternalDomains: 'insufficient_validation_per_domain',
  independentReplicationCoverage: 'insufficient_independent_replication',
  candidateDomainParity: 'candidate_domain_support_is_not_identical'
});

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function observedScope(candidates) {
  const taskFamilies = unique(candidates.flatMap(candidate => candidate.taskFamilies));
  const modelIds = unique(candidates.flatMap(candidate => candidate.modelIds));
  const externalDomains = unique(candidates.flatMap(candidate => candidate.domains));
  return {
    candidateCount: candidates.length,
    validationRows: candidates.reduce((sum, candidate) => sum + candidate.validationTasks, 0),
    taskFamilies: taskFamilies.length,
    modelIds: modelIds.length,
    externalDomains: externalDomains.length
  };
}

function reasonFor(field, aggregate) {
  return aggregate[field] ? null : REASONS[field] || null;
}

function observedGate(aggregate) {
  const fields = ['explicitDomainMetadata', 'externalDomainCoverage', 'balancedExternalDomains',
    'independentReplicationCoverage', 'candidateDomainParity'];
  return fields.map(field => reasonFor(field, aggregate)).filter(Boolean);
}

function evaluate(aggregate, candidates) {
  const scope = observedScope(candidates);
  const observedReasons = observedGate(aggregate);
  return {
    protocolVersion: manifest.protocolVersion,
    status: 'not_proven',
    claim: manifest.claimPolicy.universalClaim,
    scope,
    observedCoverage: { ...aggregate },
    observedGate: observedReasons.length ? 'blocked' : 'observed_only',
    reasons: unique(['finite_observed_corpus_cannot_establish_universal_superiority', ...observedReasons]),
    finiteCorpusWarning: manifest.claimPolicy.finiteObservedCorpus
  };
}

module.exports = { manifest, evaluate };
