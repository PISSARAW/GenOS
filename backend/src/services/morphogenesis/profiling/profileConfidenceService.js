'use strict';

const { PROFILE_DIMENSIONS } = require('./problemMorphologyProfiler');
const { evidenceId } = require('./profileEvidenceService');

function confidenceForEvidence(profile, dimension, evidenceRecords = []) {
  const item = profile && profile.dimensions && profile.dimensions[dimension];
  if (!item || !PROFILE_DIMENSIONS.includes(dimension)) return { confidence: 0, evidenceCount: 0 };
  const references = new Set(item.evidenceRefs || []);
  const values = evidenceRecords
    .filter((record) => references.has(evidenceId(record)) && Number.isFinite(record.confidence))
    .map((record) => record.confidence)
    .filter((value) => value >= 0 && value <= 1);
  if (values.length === 0) return { confidence: item.confidence, evidenceCount: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { confidence: Number(mean.toFixed(4)), evidenceCount: values.length };
}

function applyProfileConfidence(profile, dimension, evidenceRecords = []) {
  if (!PROFILE_DIMENSIONS.includes(dimension)) throw new Error(`Unknown profile dimension: ${dimension}`);
  const result = confidenceForEvidence(profile, dimension, evidenceRecords);
  const dimensions = { ...profile.dimensions };
  dimensions[dimension] = { ...dimensions[dimension], confidence: result.confidence };
  return { profile: { ...profile, dimensions }, evidenceCount: result.evidenceCount };
}

module.exports = { confidenceForEvidence, applyProfileConfidence };
