'use strict';

const calibration = require('./trinityResearchCalibration');
const audit = require('./trinityEvidenceAudit');

function analyze(input) {
  const config = input.design.research || {};
  const model = calibration.calibrate(config.calibrationSamples);
  return { calibration: model, errorCorrelation: calibration.errorCorrelation(config.errorSamples),
    semanticReview: semanticReview(input.worlds), adjustedVectors: adjustedVectors(input.worlds),
    decisionAuthority: 'none' };
}

function semanticReview(worlds) {
  const claims = (worlds || []).flatMap(world => (world.report?.claims || [])
    .filter(claim => audit.isIndependentlyVerifiedClaim(claim) && validProposition(claim.proposition))
    .map(claim => ({ ...claim, worldNumber: world.worldNumber })));
  const relations = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const relation = comparePropositions(claims[i], claims[j]);
      if (relation) relations.push(relation);
    }
  }
  return { status: claims.length ? 'analyzed' : 'unavailable', method: 'typed_proposition_comparison_v1',
    claimCount: claims.length, relations, decisionAuthority: 'none' };
}

function validProposition(proposition) {
  return typeof proposition?.subject === 'string' && typeof proposition.predicate === 'string'
    && ['string', 'boolean', 'number'].includes(typeof proposition.value);
}

function comparePropositions(left, right) {
  if (left.worldNumber === right.worldNumber) return null;
  const a = left.proposition, b = right.proposition;
  if (a.subject !== b.subject || a.predicate !== b.predicate) return null;
  return { from: left.id, to: right.id, type: a.value === b.value ? 'equivalent' : 'contradicts',
    sourceRefs: [...left.evidence, ...right.evidence], status: 'observed', authority: 'none' };
}

function adjustedVectors(worlds) {
  return (worlds || []).filter(world => validUncertainty(world.report)).map(world => ({
    worldNumber: world.worldNumber, uncertainty: world.report.evidenceVector.uncertainty,
    vector: Object.fromEntries(Object.entries(world.report.evidenceVector)
      .filter(([, value]) => Number.isFinite(value)).map(([key, value]) => [key,
        adjustMetric(key, value, world.report.evidenceVector.uncertainty)])),
    method: 'orientation_aware_uncertainty_adjustment_v1', decisionAuthority: 'none'
  }));
}

function adjustMetric(key, value, uncertainty) {
  if (key === 'uncertainty') return value;
  if (key === 'risk') return 1 - (1 - value) * (1 - uncertainty);
  if (['cost', 'latency'].includes(key)) return uncertainty === 1 ? null : value / (1 - uncertainty);
  return value * (1 - uncertainty);
}

function validUncertainty(report) {
  const uncertainty = report?.evidenceVector?.uncertainty;
  const ids = new Set((report?.evidence || []).filter(item => audit.isVerifiedReceipt(item.verificationReceipt)).map(item => item.id));
  const refs = report?.evidenceVectorEvidence?.uncertainty;
  return Number.isFinite(uncertainty) && uncertainty >= 0 && uncertainty <= 1
    && Array.isArray(refs) && refs.length > 0 && refs.every(id => ids.has(id));
}

module.exports = { analyze, semanticReview, adjustedVectors, adjustMetric };
