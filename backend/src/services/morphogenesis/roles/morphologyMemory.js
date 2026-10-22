'use strict';

function recordEntry(entry, state) {
  const recordEntry = { recordedAt: Date.now(), ...(entry || {}) };
  const signature = recordEntry.problemSignature;
  if (signature !== undefined && signature !== null) {
    state.signatureIndex.set(signature, recordEntry);
  }
  state.topologyLog.push(recordEntry);
  const perf = recordEntry.performance;
  if (signature !== undefined && signature !== null && perf !== undefined) {
    state.performanceIndex.set(signature, perf);
  }
  return recordEntry;
}

function recordMutation(mutation, mutationHistory) {
  const entry = { recordedAt: Date.now(), ...(mutation || {}) };
  mutationHistory.push(entry);
  return entry;
}

function lookupBySignature(signature, signatureIndex) {
  return signatureIndex.get(signature) || null;
}

function performanceOf(signature, performanceIndex) {
  return performanceIndex.get(signature) || null;
}

function topologyLogEntries(topologyLog) {
  return [...topologyLog];
}

function mutationHistoryEntries(mutationHistory) {
  return [...mutationHistory];
}

function createMorphologyMemory(input = {}) {
  const signatureIndex = input.signatureIndex || new Map();
  const topologyLog = input.topologyLog || [];
  const mutationHistory = input.mutationHistory || [];
  const performanceIndex = input.performanceIndex || new Map();
  const state = { signatureIndex, topologyLog, mutationHistory, performanceIndex };
  return {
    signatureIndex,
    topologyLog,
    mutationHistory,
    performanceIndex,
    record: (entry) => recordEntry(entry, state),
    recordMutation: (mutation) => recordMutation(mutation, state.mutationHistory),
    lookupBySignature: (signature) => lookupBySignature(signature, state.signatureIndex),
    performanceOf: (signature) => performanceOf(signature, state.performanceIndex),
    topologyLogEntries: () => topologyLogEntries(state.topologyLog),
    mutationHistoryEntries: () => mutationHistoryEntries(state.mutationHistory)
  };
}

module.exports = { createMorphologyMemory };
