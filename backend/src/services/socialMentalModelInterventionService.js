'use strict';

const crypto = require('node:crypto');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function indexMemories(memories) {
  if (!Array.isArray(memories)) fail('SOCIAL_INTERVENTION_INVALID', 'memories must be an array.');
  const map = new Map();
  for (const memory of memories) {
    if (!memory || typeof memory.id !== 'string' || !memory.id.trim() || map.has(memory.id)) {
      fail('SOCIAL_INTERVENTION_INVALID', 'Memory ids must be declared and unique.');
    }
    map.set(memory.id, memory);
  }
  return map;
}

function selectedSocialIds(input, memoryMap) {
  if (!Array.isArray(input.socialMemoryIds) || input.socialMemoryIds.length === 0) {
    fail('SOCIAL_INTERVENTION_INVALID', 'socialMemoryIds must identify at least one social memory.');
  }
  const ids = [...new Set(input.socialMemoryIds)];
  if (ids.length !== input.socialMemoryIds.length || ids.some((id) => !memoryMap.has(id))) {
    fail('SOCIAL_INTERVENTION_INVALID', 'Every selected social memory must exist exactly once.');
  }
  return ids;
}

function validateReplacements(input, replacedIds) {
  if (!Array.isArray(input.replacementMemories) || input.replacementMemories.length !== replacedIds.length) {
    fail('SOCIAL_INTERVENTION_INVALID', 'Counterfactual intervention requires one replacement per selected memory.');
  }
  const ids = input.replacementMemories.map((memory) => memory?.id);
  if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    fail('SOCIAL_INTERVENTION_INVALID', 'Replacement memory ids must be non-empty and unique.');
  }
}

function applyMemoryIntervention(input = {}) {
  const mode = input.mode;
  if (!['mask-social-memories', 'counterfactual-social-memories'].includes(mode)) {
    fail('SOCIAL_INTERVENTION_INVALID', 'Unsupported social memory intervention.');
  }
  const memoryMap = indexMemories(input.memories);
  const selectedIds = selectedSocialIds(input, memoryMap);
  if (mode === 'counterfactual-social-memories') validateReplacements(input, selectedIds);
  const selected = new Set(selectedIds);
  const retained = [...memoryMap.values()].filter((memory) => !selected.has(memory.id));
  const replacements = mode === 'counterfactual-social-memories' ? input.replacementMemories : [];
  if (replacements.some((memory) => memoryMap.has(memory.id))) fail('SOCIAL_INTERVENTION_INVALID', 'Replacement ids must not collide with existing memories.');
  const memories = [...retained, ...replacements].sort((left, right) => left.id.localeCompare(right.id));
  const nonSocial = [...memoryMap.values()].filter((memory) => !selected.has(memory.id));
  const receipt = {
    interventionId: String(input.interventionId || '').trim(),
    mode,
    removedMemoryIds: selectedIds,
    addedMemoryIds: replacements.map((memory) => memory.id),
    beforeHash: hash([...memoryMap.values()]),
    afterHash: hash(memories),
    preservedNonSocialMemoryHash: hash(nonSocial),
  };
  if (!receipt.interventionId) fail('SOCIAL_INTERVENTION_INVALID', 'interventionId is required.');
  return { memories, receipt };
}

module.exports = { applyMemoryIntervention };
