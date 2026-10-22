'use strict';

const { DEFAULT_HALF_LIFE_MS } = require('../memory/morphologyPriorFreshness');

const DEFAULT_MEMORY_RETENTION_DAYS = 30;
const DEFAULT_MAX_ENTRIES = 10000;

function evictIfNeeded(state) {
  while (state.topologyLog.length > state.maxEntries) {
    state.topologyLog.shift();
  }
}

function updateSignatureEntry(signature, record, state) {
  const current = state.signatureIndex.get(signature);
  if (!current || Number(record.performance ?? -Infinity) >= Number(current.performance ?? -Infinity)) {
    state.signatureIndex.set(signature, record);
  }
}

function recordEntry(entry, state) {
  const now = Number.isFinite(entry && entry.recordedAt) ? Number(entry.recordedAt) : Date.now();
  const record = { recordedAt: now, ...(entry || {}) };
  const signature = record.problemSignature;
  state.topologyLog.push(record);
  evictIfNeeded(state);
  if (signature !== undefined && signature !== null) {
    updateSignatureEntry(signature, record, state);
    if (record.performance !== undefined) state.performanceIndex.set(signature, record.performance);
  }
  return record;
}

function recordMutation(mutation, mutationHistory) {
  const entry = { recordedAt: Date.now(), ...(mutation || {}) };
  mutationHistory.push(entry);
  return entry;
}

function isFresh(entry, retentionMs, now) {
  if (!entry || !Number.isFinite(entry.recordedAt)) return true;
  return now - entry.recordedAt <= retentionMs;
}

function lookupBySignature(signature, state, now = Date.now()) {
  const candidates = state.topologyLog
    .filter((entry) => entry.problemSignature === signature && isFresh(entry, state.retentionMs, now))
    .sort((a, b) => Number(b.performance ?? 0) - Number(a.performance ?? 0));
  if (candidates.length > 0) return candidates[0];
  const indexed = state.signatureIndex.get(signature) || null;
  return indexed && isFresh(indexed, state.retentionMs, now) ? indexed : null;
}

function performanceOf(signature, performanceIndex) {
  const val = performanceIndex.get(signature);
  return val !== undefined ? val : null;
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
  const retentionDays = Number(input.memoryRetention) > 0 ? Number(input.memoryRetention) : DEFAULT_MEMORY_RETENTION_DAYS;
  const retentionMs = Number(input.retentionMs) > 0 ? Number(input.retentionMs) : retentionDays * 86400000;
  const maxEntries = Number.isInteger(input.maxEntries) && input.maxEntries > 0 ? input.maxEntries : DEFAULT_MAX_ENTRIES;
  const state = { signatureIndex, topologyLog, mutationHistory, performanceIndex, retentionMs, maxEntries };
  return {
    signatureIndex,
    topologyLog,
    mutationHistory,
    performanceIndex,
    retentionMs,
    maxEntries,
    record: (entry) => recordEntry(entry, state),
    recordMutation: (mutation) => recordMutation(mutation, state.mutationHistory),
    lookupBySignature: (signature, now) => lookupBySignature(signature, state, now),
    performanceOf: (signature) => performanceOf(signature, state.performanceIndex),
    topologyLogEntries: () => topologyLogEntries(state.topologyLog),
    mutationHistoryEntries: () => mutationHistoryEntries(state.mutationHistory)
  };
}

module.exports = { createMorphologyMemory, DEFAULT_MEMORY_RETENTION_DAYS, DEFAULT_HALF_LIFE_MS, DEFAULT_MAX_ENTRIES };
