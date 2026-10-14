'use strict';

const { hasEvidenceReferences } = require('./workerEvidenceReferenceService');

const HYPOTHESES = [
  'coldStartOrJit', 'sleepingConnectionPool', 'coldApplicationCacheOrDns',
  'swapOrPageCache', 'autoscalingOrSleep', 'tlsSessionResumption'
];
const ASSESSMENTS = new Set(['plausible_unverified', 'weakened_unverified', 'unresolved']);

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validHypothesisRow(row) {
  return row && typeof row === 'object' && ASSESSMENTS.has(row.assessment)
    && nonEmptyText(row.predictedSignals)
    && nonEmptyText(row.contradictoryObservations)
    && nonEmptyText(row.discriminatingMeasurement)
    && hasEvidenceReferences(row.evidence);
}

function diagnosticMatrixIsValid(content) {
  const matrix = content?.diagnosticMatrix;
  return Boolean(content && typeof content === 'object'
    && HYPOTHESES.every((key) => validHypothesisRow(matrix?.[key]))
    && nonEmptyText(content.conditionalVerdict)
    && Array.isArray(content.uncertainties) && content.uncertainties.length > 0
    && content.uncertainties.every(nonEmptyText));
}

module.exports = { diagnosticMatrixIsValid, HYPOTHESES };
