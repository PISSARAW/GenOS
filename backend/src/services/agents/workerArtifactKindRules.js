'use strict';

const { hasEvidenceReferences } = require('./workerEvidenceReferenceService');

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCounterexamples(items) {
  return Array.isArray(items) && items.length > 0 && items.every((item) =>
    text(item?.claim) && text(item?.attack) && Array.isArray(item.reproductionSteps)
    && item.reproductionSteps.length > 0 && item.reproductionSteps.every(text)
    && hasEvidenceReferences(item.evidence));
}

function kindArtifactIsInvalid(input) {
  const { kind, type, content } = input;
  if (kind === 'red_worker' && type === 'verification_report') return !hasCounterexamples(content?.counterexamples);
  const check = kindChecker(input);
  return check === true;
}

function kindChecker(input) {
  const { kind, type, content, contract } = input;
  if (type !== 'dossier') return false;
  if (kind === 'recovery_worker') return !recoveryReceipt(content?.recoveryReceipt);
  if (kind === 'liaison_worker') return !handoff(content?.handoff);
  if (kind === 'resident_daemon') return !territory(content?.territoryReport);
  if (kind === 'bounded_worker') return !scope(content?.scopeCompletion);
  if (kind === 'adaptive_worker') return !strategyTrace(content?.strategyTrace);
  if (kind === 'specialist') return !specialty(content?.specialtyAssessment, contract?.mission?.specialtyNiche);
  if (kind === 'symbiotic_worker') return !hostContribution(content?.hostContribution, contract);
  if (kind === 'sub_orchestrator') return !childSummaries(content?.childSummaries, contract);
  return false;
}

function recoveryReceipt(value) {
  return text(value?.action) && text(value?.restoredState) && text(value?.receiptId) && hasEvidenceReferences(value?.evidence);
}

function handoff(value) {
  return text(value?.sourceGroup) && text(value?.targetGroup) && value.sourceGroup !== value.targetGroup
    && hasEvidenceReferences(value?.deliveredRefs);
}

function territory(value) {
  return text(value?.territoryId) && Number.isFinite(Date.parse(value?.observedAt))
    && hasEvidenceReferences(value?.sourceRefs);
}

function scope(value) {
  return text(value?.scopeRef) && hasEvidenceReferences(value?.completedRefs);
}

function strategyTrace(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => text(entry?.strategy)
    && ['retained', 'changed'].includes(entry.decision) && text(entry.reason)
    && hasEvidenceReferences(entry.evidence));
}

function specialty(value, expected) {
  return text(value?.niche) && (!expected || value.niche === expected)
    && value.inScope === true && hasEvidenceReferences(value.evidence);
}

function hostContribution(value, contract) {
  const capabilities = contract?.mission?.hostCapabilities || [];
  const matches = !contract?.mission?.hostContractId || value?.hostContractId === contract.mission.hostContractId;
  return text(value?.hostContractId) && matches
    && (capabilities.length ? capabilities.includes(value.capability) : text(value.capability))
    && value.contractCompliant === true && hasEvidenceReferences(value.evidence);
}

function childSummaries(items, contract) {
  const max = contract ? (Number.isSafeInteger(contract.limits?.maxChildren) ? contract.limits.maxChildren : 0) : Infinity;
  return Array.isArray(items) && items.length <= max && items.every((item) => text(item?.childId)
    && ['success', 'failed', 'blocked'].includes(item.outcome) && hasEvidenceReferences(item.evidence));
}

function validateInspectedKindArtifact(result, kind, type) {
  if (!result.artifact) return result;
  const invalid = kindArtifactIsInvalid({ kind, type, content: result.artifact.content });
  if (!invalid) return result;
  return { artifact: null, issues: [...result.issues, 'workerArtifact.content.kind_specific.invalid'] };
}

module.exports = { kindArtifactIsInvalid, validateInspectedKindArtifact };
