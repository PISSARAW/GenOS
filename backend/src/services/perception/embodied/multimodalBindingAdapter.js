'use strict';

const { createHash } = require('node:crypto');

function bind(percepts) {
  if (!Array.isArray(percepts) || !percepts.length) throw new TypeError('Typed percept batch required.');
  const modalities = [...new Set(percepts.map((item) => item.modality))];
  const bindingRef = createHash('sha256').update(JSON.stringify(percepts.map((item) => item.artifactRef).sort())).digest('hex');
  const items = percepts.map((item) => ({ id: item.perceptId, entityId: item.entityId,
    modality: item.modality, confidence: item.confidence, predictionError: item.uncertainty,
    sourceModalities: modalities, features: numericFeatures(item.semanticSummary),
    artifactRef: item.artifactRef, bindingRef }));
  return { bindingRef, modalities, artifactRefs: percepts.map((item) => item.artifactRef), items };
}

function numericFeatures(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return {};
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => Number.isFinite(value) || typeof value === 'boolean'));
}

module.exports = { bind, numericFeatures };
