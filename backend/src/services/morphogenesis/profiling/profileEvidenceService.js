'use strict';

const { PROFILE_DIMENSIONS } = require('./problemMorphologyProfiler');

function evidenceId(reference) {
  if (typeof reference === 'string') return reference;
  return reference && (reference.evidenceId || reference.id);
}

function attachProfileEvidence(profile, dimension, reference) {
  if (!PROFILE_DIMENSIONS.includes(dimension)) throw new Error(`Unknown profile dimension: ${dimension}`);
  const ref = evidenceId(reference);
  if (!ref) throw new Error('evidence reference requires an id');
  const dimensions = { ...profile.dimensions };
  const item = dimensions[dimension] || { value: null, confidence: 0, evidenceRefs: [], observedAt: null };
  const refs = item.evidenceRefs || [];
  dimensions[dimension] = { ...item, evidenceRefs: refs.includes(ref) ? [...refs] : [...refs, ref] };
  return { ...profile, dimensions };
}

function evidenceReferencesFor(profile, dimension) {
  if (!profile || !profile.dimensions || !profile.dimensions[dimension]) return [];
  return [...(profile.dimensions[dimension].evidenceRefs || [])];
}

module.exports = { attachProfileEvidence, evidenceReferencesFor, evidenceId };
