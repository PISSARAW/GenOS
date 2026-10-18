'use strict';

/**
 * @file workingMemoryService.js
 * @description Mémoire de travail (working memory) côté Node.
 * Cache borné avec TTL métabolique : court-circuite le recalcul quand un
 * problème identique a déjà été résolu récemment. Aucune dépendance externe.
 */

const MAX_ENTRIES = 1024;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 heure

function now() {
  return Date.now();
}

function createStore(options = {}) {
  const maxEntries = Number(options.maxEntries) || MAX_ENTRIES;
  const defaultTtl = Number(options.defaultTtlMs) || DEFAULT_TTL_MS;
  return Object.freeze({
    cache: new Map(),
    maxEntries,
    defaultTtl
  });
}

function pruneStore(store) {
  const time = now();
  for (const [key, entry] of store.cache) {
    if (entry.expiresAt <= time) store.cache.delete(key);
  }
}

function evictOldest(store) {
  if (store.cache.size === 0) return;
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [k, e] of store.cache) {
    if (e.expiresAt < oldestTime) {
      oldestTime = e.expiresAt;
      oldestKey = k;
    }
  }
  if (oldestKey) store.cache.delete(oldestKey);
}

function memorize(store, key, entry) {
  if (!key || typeof key !== 'string') return false;
  if (!entry || typeof entry.value === 'undefined') return false;
  pruneStore(store);
  if (store.cache.size >= store.maxEntries && !store.cache.has(key)) {
    evictOldest(store);
  }
  store.cache.set(key, {
    value: entry.value,
    expiresAt: now() + (Number.isFinite(entry.ttlMs) ? entry.ttlMs : store.defaultTtl),
    hits: 0
  });
  return true;
}

function recall(store, key) {
  if (typeof key !== 'string') return undefined;
  pruneStore(store);
  const entry = store.cache.get(key);
  if (!entry) return undefined;
  entry.hits += 1;
  return entry.value;
}

function forget(store, key) {
  if (typeof key !== 'string') return 0;
  return store.cache.delete(key) ? 1 : 0;
}

function stats(store) {
  pruneStore(store);
  let hits = 0;
  let size = 0;
  for (const entry of store.cache.values()) {
    size += 1;
    hits += entry.hits;
  }
  return { size, maxEntries: store.maxEntries, hits, defaultTtlMs: store.defaultTtl };
}

module.exports = { createStore, memorize, recall, forget, pruneStore, evictOldest, stats,
  MAX_ENTRIES, DEFAULT_TTL_MS };
