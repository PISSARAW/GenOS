'use strict';

const REQUIRED_FIELDS = Object.freeze(['problemSignature', 'initialProfile', 'morphologyGraph']);

function validateMemoryEntry(entry) {
  return REQUIRED_FIELDS.filter((field) => entry[field] === undefined || entry[field] === null).map((field) => `missing ${field}`);
}

async function recordMorphologyMemory(entry, store) {
  const errors = validateMemoryEntry(entry || {});
  if (errors.length) throw new Error(errors.join('; '));
  if (!store || typeof store.put !== 'function') throw new Error('morphology memory store is required');
  const record = { profileTrajectory: [], transitions: [], workers: [], cost: {}, quality: {}, failures: [], successfulMutations: [], ...entry };
  await store.put(record.problemSignature, record);
  return record;
}

module.exports = { recordMorphologyMemory, validateMemoryEntry };
