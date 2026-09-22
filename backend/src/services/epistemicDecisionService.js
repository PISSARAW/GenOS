'use strict';

const INTERPRETIVE = new Set(['interpretive', 'disputed', 'contested']);
const VERIFIED = new Set(['verified', 'observed', 'justified', 'supported']);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sourceOf(input = {}) {
  return input.epistemicAnalyses || input.epistemic_analyses || input.epistemicResults || input.epistemic_results || [];
}

function analysisId(item, index) {
  return String(item.analysisId || item.analysis_id || item.id || `analysis-${index + 1}`).trim();
}

function conceptId(item) {
  return String(item.conceptId || item.concept_id || item.concept || 'unknown').trim();
}

function resultOf(item) {
  return item.result && typeof item.result === 'object' ? item.result : item;
}

function statusOf(item, result) {
  return String(item.interpretationStatus || item.interpretation_status || result.interpretationStatus
    || result.status || result.epistemicStatus || 'unknown').toLowerCase();
}

function provenanceOf(item, result) {
  return item.provenance || result.provenance || {};
}

function hasProvenance(provenance) {
  return Boolean(provenance && typeof provenance === 'object' && (
    provenance.provenanceHash || provenance.hash || provenance.version
      || provenance.sourceType || provenance.sourceDocument || provenance.sourceLocator
  ));
}

function hasEvidence(item, result) {
  const evidence = item.evidence || result.evidence || result.receipts || result.sourceRefs;
  return result.evidenceVerified === true || result.provenanceVerified === true
    || (Array.isArray(evidence) && evidence.length > 0)
    || VERIFIED.has(statusOf(item, result));
}

function normalize(item, index) {
  const source = item && typeof item === 'object' ? item : { result: item };
  const result = resultOf(source);
  const status = statusOf(source, result);
  const provenance = provenanceOf(source, result);
  return {
    analysisId: analysisId(source, index),
    conceptId: conceptId(source),
    status,
    interpretive: INTERPRETIVE.has(status),
    evidencePresent: hasEvidence(source, result),
    provenance,
    provenanceComplete: hasProvenance(provenance),
    result
  };
}

function normalizeAnalyses(input = {}) {
  return list(sourceOf(input)).map(normalize);
}

function buildDecisionContext(input = {}) {
  const analyses = normalizeAnalyses(input);
  const interpretive = analyses.some((item) => item.interpretive);
  const missingProvenance = analyses.filter((item) => !item.provenanceComplete).map((item) => item.analysisId);
  const unsupported = analyses.filter((item) => !item.evidencePresent).map((item) => item.analysisId);
  const hasResults = analyses.length > 0;
  const verifierDigests = [];
  if (Array.isArray(input.epistemic_verifier_digests)) {
    for (const d of input.epistemic_verifier_digests) {
      if (typeof d === 'string' && d.length) verifierDigests.push(d);
    }
  }
  return {
    analyses,
    analysisIds: analyses.map((item) => item.analysisId),
    interpretive,
    provenanceComplete: hasResults && missingProvenance.length === 0,
    missingProvenance,
    unsupported,
    promotion: {
      holdPromotion: hasResults && (interpretive || missingProvenance.length > 0 || unsupported.length > 0),
      requireIndependentVerification: hasResults,
      requireHumanApproval: interpretive,
      requireProvenance: hasResults,
    },
    verifierDigests
  };
}

function verifiedForPromotion(context = {}) {
  if (context.epistemicEvidenceVerified === true) return true;
  if (context.epistemicVerification?.verified === true) return true;
  const evidence = context.epistemicEvidence || context.report?.epistemicEvidence;
  return Array.isArray(evidence) && evidence.length > 0 && evidence.every((item) => item?.verified !== false);
}

function evaluatePromotionContext(contract = {}, executionContext = {}) {
  const context = contract.epistemic_context;
  if (!context?.analyses?.length || !context.promotion?.holdPromotion) return [];
  if (verifiedForPromotion(executionContext)) return [];
  return [{
    policy: 'epistemic_analysis_verification',
    message: 'Epistemic analyses with interpretive, unsupported, or incomplete provenance require verified evidence before promotion.',
    analysisIds: context.analysisIds
  }];
}

function memoryMetadata(context = {}) {
  if (!context.analyses?.length) return null;
  return {
    analysisIds: context.analysisIds,
    interpretationStatus: context.interpretive ? 'interpretive' : 'descriptive',
    provenanceComplete: context.provenanceComplete,
    promotionHeld: Boolean(context.promotion?.holdPromotion)
  };
}

module.exports = { buildDecisionContext, evaluatePromotionContext, memoryMetadata, normalizeAnalyses };
