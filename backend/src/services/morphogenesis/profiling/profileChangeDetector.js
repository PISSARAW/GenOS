'use strict';

const { PROFILE_DIMENSIONS } = require('./problemMorphologyProfiler');

function sameReferences(left, right) {
  const a = [...(left || [])].sort();
  const b = [...(right || [])].sort();
  return a.length === b.length && a.every((ref, index) => ref === b[index]);
}

function detectProfileChanges(previous, current) {
  const changes = [];
  for (const dimension of PROFILE_DIMENSIONS) {
    const before = previous && previous.dimensions ? previous.dimensions[dimension] : null;
    const after = current && current.dimensions ? current.dimensions[dimension] : null;
    if (!before || !after || changed(before, after)) changes.push({ dimension, before, after });
  }
  return changes;
}

function changed(before, after) {
  return before.value !== after.value || before.confidence !== after.confidence || !sameReferences(before.evidenceRefs, after.evidenceRefs);
}

module.exports = { detectProfileChanges };
