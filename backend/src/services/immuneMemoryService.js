'use strict';

const crypto = require('crypto');
const { recordFailedStrategy } = require('./missionOrganismService');

const IMMUNE_MEMORY_SCHEMA = 'genos.immune-memory/v1alpha1';

function signatureId(input = {}) {
  return `sig_${crypto.randomUUID()}`;
}

function extractFailureSignature(input = {}) {
  const failureCategory = input.failureCategory || 'unknown';
  const strategy = input.strategy || 'unknown';
  const contextFingerprint = input.contextFingerprint || null;
  return {
    failureCategory,
    strategy,
    contextFingerprint,
    signature: crypto.createHash('sha256')
      .update(JSON.stringify({ failureCategory, strategy, contextFingerprint }))
      .digest('hex')
  };
}

function resolveRecordFields(input, failureSignature) {
  return {
    id: input.id || `immune_${crypto.randomUUID()}`,
    failureCategory: failureSignature.failureCategory || 'unknown',
    strategy: failureSignature.strategy || 'unknown',
    contextFingerprint: failureSignature.contextFingerprint || null,
    signature: failureSignature.signature || signatureId(input)
  };
}

function immuneRecord(input = {}) {
  const failureSignature = input.failureSignature || extractFailureSignature(input);
  const resolved = resolveRecordFields(input, failureSignature);
  return {
    ...resolved,
    prohibitedExactRetry: input.prohibitedExactRetry !== false,
    preferredResponse: input.preferredResponse || null,
    recordedAt: input.recordedAt || new Date().toISOString(),
    attempts: Number(input.attempts || 1),
    lastOutcome: input.lastOutcome || null
  };
}

function immuneMemoryFromOrganism(organism) {
  const failedStrategies = organism && organism.memory && organism.memory.failedStrategies;
  if (!Array.isArray(failedStrategies)) return [];
  return failedStrategies.map((entry) => immuneRecord(entry)).filter(Boolean);
}

function findMatchingMemory(immuneMemories, signature) {
  if (!Array.isArray(immuneMemories)) return null;
  return immuneMemories.find((entry) => entry.signature === signature);
}

function findMatchingMemoriesByCategory(immuneMemories, failureCategory) {
  if (!Array.isArray(immuneMemories)) return [];
  return immuneMemories.filter((entry) => entry.failureCategory === failureCategory);
}

function isExactRetryProhibited(immuneMemories, input = {}) {
  const failureSignature = input.failureSignature || extractFailureSignature(input);
  const memory = findMatchingMemory(immuneMemories, failureSignature.signature);
  if (!memory) return false;
  return memory.prohibitedExactRetry !== false;
}

function preferredResponseFor(immuneMemories, input = {}) {
  const failureSignature = input.failureSignature || extractFailureSignature(input);
  const memory = findMatchingMemory(immuneMemories, failureSignature.signature);
  return memory ? (memory.preferredResponse || null) : null;
}

function enrollImmuneMemory(organism, input = {}) {
  const record = immuneRecord(input);
  return recordFailedStrategy(organism, {
    failureCategory: record.failureCategory,
    strategy: record.strategy,
    signature: record.signature,
    prohibitedExactRetry: record.prohibitedExactRetry,
    preferredResponse: record.preferredResponse
  });
}

function updateImmuneMemory(organism, memoryId, input = {}) {
  const memories = immuneMemoryFromOrganism(organism);
  const index = memories.findIndex((m) => m.id === memoryId);
  if (index < 0) return { updated: false, organism, index };
  const updatedRecord = Object.assign({}, memories[index], input);
  const updatedOrganism = recordFailedStrategy(organism, {
    failureCategory: updatedRecord.failureCategory,
    strategy: updatedRecord.strategy,
    signature: updatedRecord.signature,
    prohibitedExactRetry: updatedRecord.prohibitedExactRetry,
    preferredResponse: updatedRecord.preferredResponse
  });
  return { updated: true, organism: updatedOrganism, index };
}

function immuneResponse(organism, input = {}) {
  const memories = immuneMemoryFromOrganism(organism);
  const failureSignature = input.failureSignature || extractFailureSignature(input);
  const matching = findMatchingMemory(memories, failureSignature.signature);
  const categoryMatches = findMatchingMemoriesByCategory(memories, failureSignature.failureCategory);
  return {
    schema: IMMUNE_MEMORY_SCHEMA,
    recognized: !!matching,
    signature: failureSignature.signature,
    memory: matching || null,
    categoryMatchCount: categoryMatches.length,
    response: {
      prohibitExactRetry: matching ? matching.prohibitedExactRetry : false,
      prohibitedByMemory: !!matching,
      preferredResponse: preferredResponseFor(memories, input),
      categoryPreferredResponse: categoryMatches.length > 0 ? categoryMatches[0].preferredResponse : null,
      suggestAlternative: matching ? (matching.prohibitedExactRetry ? 'replace_strategy' : 'retry_with_modification') : 'unknown'
    }
  };
}

function summarizeImmuneMemory(immuneMemories) {
  if (!Array.isArray(immuneMemories)) return [];
  const summary = {};
  for (const memory of immuneMemories) {
    const category = memory.failureCategory || 'unknown';
    if (!summary[category]) {
      summary[category] = {
        category,
        count: 0,
        prohibitedExactRetry: 0,
        strategies: new Set()
      };
    }
    summary[category].count += 1;
    if (memory.prohibitedExactRetry) summary[category].prohibitedExactRetry += 1;
    summary[category].strategies.add(memory.strategy);
  }
  return Object.values(summary).map((s) => ({
    category: s.category,
    count: s.count,
    prohibitedExactRetry: s.prohibitedExactRetry,
    strategies: Array.from(s.strategies)
  }));
}

module.exports = {
  IMMUNE_MEMORY_SCHEMA,
  signatureId,
  extractFailureSignature,
  immuneRecord,
  immuneMemoryFromOrganism,
  findMatchingMemory,
  findMatchingMemoriesByCategory,
  isExactRetryProhibited,
  preferredResponseFor,
  enrollImmuneMemory,
  updateImmuneMemory,
  immuneResponse,
  summarizeImmuneMemory
};