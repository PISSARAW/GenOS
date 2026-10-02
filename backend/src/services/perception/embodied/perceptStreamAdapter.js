'use strict';

const MODALITIES = new Set(['vision', 'audio', 'tactile', 'proprioception']);

function normalize(input) {
  if (!input || !MODALITIES.has(input.modality) || !reference(input.artifactRef)
    || !input.entityId || typeof input.entityId !== 'string' || !validSummary(input.semanticSummary)) {
    throw new TypeError('Embodied percept requires modality, artifact reference, entity and compact summary.');
  }
  return { perceptId: String(input.perceptId || `${input.entityId}:${input.modality}`),
    modality: input.modality, artifactRef: input.artifactRef, bindingRef: input.bindingRef || null,
    entityId: input.entityId, semanticSummary: compactSummary(input.semanticSummary),
    confidence: bounded(input.confidence), uncertainty: bounded(input.uncertainty),
    observedAt: input.observedAt || new Date().toISOString() };
}

function validSummary(summary) {
  return typeof summary === 'string' && summary.length <= 500
    || summary && typeof summary === 'object' && Object.getPrototypeOf(summary) === Object.prototype
      && Object.keys(summary).length <= 32
      && Object.values(summary).every((value) => typeof value === 'string' || Number.isFinite(value) || typeof value === 'boolean');
}

function compactSummary(summary) { return typeof summary === 'string' ? summary.slice(0, 500) : { ...summary }; }
function reference(value) { return typeof value === 'string' && value.length > 0 && value.length <= 512; }
function bounded(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5; }

module.exports = { MODALITIES, normalize, validSummary };
