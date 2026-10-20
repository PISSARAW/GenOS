'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const REQUIRED_EVIDENCE = Object.freeze([
  'ci.linux', 'ci.windows',
  'ett.holdout.1', 'ett.holdout.2', 'ett.holdout.3',
  'stewardship.q1', 'stewardship.q2', 'stewardship.q3', 'stewardship.q4', 'stewardship.q5',
  'topology.trinity', 'topology.a-team', 'topology.biome', 'topology.biocenose',
  'topology.holobionte', 'topology.syncytium', 'topology.rhizome', 'topology.metapopulation'
]);

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function proofMaterial(proof) {
  const { proofHash, ...material } = proof;
  return material;
}

function sealEvidenceProof(input) {
  const material = { schema: 'genos.campaign-evidence-proof/v1', ...input };
  return { ...material, proofHash: digest(material) };
}

function validProofIdentity(proof) {
  return proof?.schema === 'genos.campaign-evidence-proof/v1'
    && REQUIRED_EVIDENCE.includes(proof.requirementId)
    && ['synthetic', 'external'].includes(proof.evidenceClass)
    && proof.status === 'SUPPORTED';
}

function validProofBinding(proof, dossier) {
  return proof.configHash === dossier.configHash
    && proof.revision === dossier.revision
    && proof.verifierId !== proof.producerId
    && typeof proof.verifierKeyId === 'string' && proof.verifierKeyId.length > 0;
}

function validProofArtifact(proof) {
  return typeof proof.artifactRef === 'string' && proof.artifactRef.length > 0
    && /^[a-f0-9]{64}$/.test(proof.artifactHash || '')
    && proof.proofHash === digest(proofMaterial(proof));
}

function validProof(proof, dossier) {
  return validProofIdentity(proof) && validProofBinding(proof, dossier)
    && validProofArtifact(proof);
}

function dossierMaterial(dossier) {
  const { activation, dossierHash, ...material } = dossier;
  return material;
}

function validDossierSeal(dossier) {
  return dossier?.schema === 'genos.qualification-campaign-dossier/v1'
    && dossier.dossierHash === digest(dossierMaterial(dossier));
}

function executionBlockers(dossier) {
  if (!Array.isArray(dossier.workloads)) return ['dossier:workloads-invalid'];
  const outcomes = dossier.workloads.flatMap((item) => item.outcomes || []);
  const blocked = new Set(['FAILED', 'INTERVENTION_REQUIRED']);
  const blockers = outcomes.filter((item) => blocked.has(item.status))
    .map((item) => `${item.workloadId}:${item.status}`);
  if (dossier.costs?.measurementComplete !== true) blockers.push('external-costs:missing');
  if (dossier.costs?.withinBudget !== true) blockers.push('external-costs:budget-exceeded');
  return blockers;
}

function failed(reason) {
  return {
    schema: 'genos.campaign-activation-report/v1', status: 'failed', reason,
    missingEvidence: REQUIRED_EVIDENCE, blockers: [], productionAllowed: false,
    scientificPromotionAllowed: false, promotionDecision: null
  };
}

function evaluateActivation(dossier) {
  if (!validDossierSeal(dossier)) return failed('DOSSIER_INTEGRITY_FAILED');
  const proofs = Array.isArray(dossier.proofs) ? dossier.proofs : [];
  if (!proofs.every((proof) => validProof(proof, dossier))) return failed('EVIDENCE_INTEGRITY_FAILED');
  const ids = proofs.map((proof) => proof.requirementId);
  if (new Set(ids).size !== ids.length) return failed('DUPLICATE_EVIDENCE');
  const missingEvidence = REQUIRED_EVIDENCE.filter((id) => !ids.includes(id));
  const blockers = executionBlockers(dossier);
  const complete = missingEvidence.length === 0 && blockers.length === 0;
  return {
    schema: 'genos.campaign-activation-report/v1',
    status: complete ? 'qualified_non_production' : 'blocked',
    reason: complete ? 'REPORT_COMPLETE_PRODUCTION_FORBIDDEN' : 'EVIDENCE_OR_EXECUTION_INCOMPLETE',
    missingEvidence, blockers,
    syntheticEvidenceOnly: proofs.length > 0 && proofs.every((proof) => proof.evidenceClass === 'synthetic'),
    productionAllowed: false,
    scientificPromotionAllowed: false,
    promotionDecision: null
  };
}

module.exports = { REQUIRED_EVIDENCE, digest, sealEvidenceProof, dossierMaterial,
  validDossierSeal, evaluateActivation };
