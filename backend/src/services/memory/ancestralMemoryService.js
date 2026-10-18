'use strict';

/**
 * @file ancestralMemoryService.js
 * @description Mémoire ancestrale : transmission de traces mémorielles d'un
 * ancêtre vers ses descendants au sein d'une même lignée.
 */

const MAX_ENTRIES = 1024;
const DEFAULT_SALIENCE = 0.5;

function createStore(options = {}) {
  const maxEntries = Number(options.maxEntries) || MAX_ENTRIES;
  return Object.freeze({
    lineages: new Map(),
    maxEntries
  });
}

function lineageMap(store, lineageId) {
  if (!store.lineages.has(lineageId)) store.lineages.set(lineageId, new Map());
  return store.lineages.get(lineageId);
}

function pruneLineage(store, lineageId) {
  const map = lineageMap(store, lineageId);
  if (map.size <= store.maxEntries) return;
  const entries = [...map.entries()].sort((a, b) => a[1].salience - b[1].salience);
  const toDrop = map.size - store.maxEntries;
  for (let i = 0; i < toDrop; i += 1) map.delete(entries[i][0]);
}

function memorize(store, context) {
  const { lineageId, memoryId, ancestorId, memory, salience } = context;
  if (!lineageId || !memoryId || !ancestorId) return false;
  const map = lineageMap(store, lineageId);
  if (map.size >= store.maxEntries && !map.has(memoryId)) pruneLineage(store, lineageId);
  map.set(memoryId, {
    ancestorId,
    memory: memory || {},
    salience: Number.isFinite(salience) ? salience : DEFAULT_SALIENCE,
    recordedAt: Date.now()
  });
  return true;
}

function recall(store, lineageId) {
  if (!lineageId) return [];
  const map = lineageMap(store, lineageId);
  const results = [];
  for (const [memoryId, entry] of map) {
    results.push({ memoryId, lineageId, ancestorId: entry.ancestorId,
      memory: entry.memory, salience: entry.salience, recordedAt: entry.recordedAt });
  }
  results.sort((a, b) => b.salience - a.salience);
  return results;
}

function forget(store, lineageId, memoryId) {
  if (!lineageId || !memoryId) return 0;
  const map = lineageMap(store, lineageId);
  return map.delete(memoryId) ? 1 : 0;
}

function stats(store) {
  let total = 0;
  let lineagesCount = 0;
  for (const map of store.lineages.values()) {
    if (map.size > 0) lineagesCount += 1;
    total += map.size;
  }
  return { total, lineages: lineagesCount, maxEntries: store.maxEntries };
}

module.exports = { createStore, memorize, recall, forget, stats,
  MAX_ENTRIES, DEFAULT_SALIENCE };
