'use strict';

const crypto = require('node:crypto');

const MAX_TEXT = 2048;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT) {
    throw new TypeError(`${label}-invalide`);
  }
  return value.trim();
}

function textSet(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${label}-requis`);
  const normalized = values.map((value) => requiredText(value, label));
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label}-duplique`);
  return normalized.sort();
}

function normalizeContract(contract) {
  if (!contract || typeof contract !== 'object') throw new TypeError('contrat-requis');
  return {
    intent: requiredText(contract.intent, 'intention'),
    constraints: textSet(contract.constraints, 'contrainte'),
    invariants: textSet(contract.invariants, 'invariant')
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function normalizeHypothesis(hypothesis) {
  if (!hypothesis || typeof hypothesis !== 'object') throw new TypeError('hypothese-requise');
  return {
    statement: requiredText(hypothesis.statement, 'hypothese'),
    falsificationCriterion: requiredText(hypothesis.falsificationCriterion, 'critere-falsification'),
    evidencePlan: textSet(hypothesis.evidencePlan, 'plan-preuve')
  };
}

function normalizeCandidate(input, contract) {
  if (input.isolated !== true) throw new Error('candidat-non-isole');
  if (input.contractHash !== contract.contractHash) throw new Error('contrat-candidat-obsolete');
  return {
    candidateId: requiredText(input.candidateId, 'candidate-id'),
    contractHash: input.contractHash,
    baseSha: requiredText(input.baseSha, 'base-sha'),
    workspaceRef: requiredText(input.workspaceRef, 'workspace-ref'),
    executorId: requiredText(input.executorId, 'executor-id'),
    isolated: true,
    hypothesis: normalizeHypothesis(input.hypothesis)
  };
}

function executableProofReason(proof) {
  if (!proof) return 'preuve-executable-requise';
  if (proof.exitCode !== 0 || proof.source !== 'ontogenesis-verifier') return 'preuve-executable-requise';
  return null;
}

function proofIdentityReason(candidate, proof) {
  if (typeof proof.verifierId !== 'string' || !proof.verifierId.trim()) return 'verificateur-requis';
  if (proof.verifierId === candidate.executorId) return 'preuve-non-independante';
  return null;
}

function proofBindingReason(candidate, proof) {
  if (proof.candidateId !== candidate.candidateId) return 'preuve-mauvais-candidat';
  if (!Array.isArray(proof.evidenceRefs) || proof.evidenceRefs.length === 0
    || !proof.evidenceRefs.every((ref) => typeof ref === 'string' && ref.trim())) return 'references-preuve-requises';
  if (!proof.treeHash) return 'empreinte-preuve-requise';
  return null;
}

function independentProof(candidate, proof) {
  const executableReason = executableProofReason(proof);
  if (executableReason) return executableReason;
  return proofIdentityReason(candidate, proof) || proofBindingReason(candidate, proof);
}

function integrationGate(proof, integration) {
  if (!integration || integration.status !== 'committed' || !integration.sha) return 'integration-verifiee-requise';
  if (!integration.treeHash || integration.treeHash !== proof.treeHash) return 'contenu-integre-different';
  return null;
}

function effectObservationReason(candidate, integration, effect) {
  if (!effect || effect.observedAfterSha !== integration.sha) return 'effet-post-integration-requis';
  if (!effect.verifierId || effect.verifierId === candidate.executorId) return 'effet-non-independant';
  return null;
}

function effectMeasurementReason(effect) {
  if (!effect.metric || !Number.isFinite(effect.baseline) || !Number.isFinite(effect.observed)) {
    return 'mesure-effet-invalide';
  }
  if (!Array.isArray(effect.evidenceRefs) || effect.evidenceRefs.length === 0) return 'preuve-effet-requise';
  return null;
}

function effectImproved(effect) {
  if (effect.direction === 'decrease') return effect.observed < effect.baseline;
  return effect.direction === 'increase' && effect.observed > effect.baseline;
}

function effectGate(candidate, integration, effect) {
  const observationReason = effectObservationReason(candidate, integration, effect);
  if (observationReason) return observationReason;
  const measurementReason = effectMeasurementReason(effect);
  if (measurementReason) return measurementReason;
  return effectImproved(effect) ? null : 'effet-projet-non-demontre';
}

function assess(candidate, input) {
  const reasons = [];
  if (input.currentContractHash !== candidate.contractHash) reasons.push('contrat-candidat-obsolete');
  const proofReason = independentProof(candidate, input.proof);
  if (proofReason) reasons.push(proofReason);
  if (!proofReason) {
    const integrationReason = integrationGate(input.proof, input.integration);
    if (integrationReason) reasons.push(integrationReason);
    else {
      const effectReason = effectGate(candidate, input.integration, input.effect);
      if (effectReason) reasons.push(effectReason);
    }
  }
  return { decision: reasons.length ? 'NO_CHANGE' : 'ADOPT', reasons };
}

module.exports = { normalizeContract, normalizeCandidate, digest, assess };
