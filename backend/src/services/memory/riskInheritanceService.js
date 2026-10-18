'use strict';

const memoryCalibration = require('./memoryCalibrationService');

/**
 * @file riskInheritanceService.js
 * @description Héritage de risque : propagation et atténuation d'un score de
 * risque d'une entité source vers une cible au sein d'une lignée.
 */

const DEFAULT_ATTENUATION = memoryCalibration.threshold('ancestralRiskAttenuation');
const MAX_ENTRIES = 1024;

function createStore(options = {}) {
  const attenuation = Number.isFinite(options.attenuation)
    ? options.attenuation : DEFAULT_ATTENUATION;
  const maxEntries = Number(options.maxEntries) || MAX_ENTRIES;
  return Object.freeze({
    risks: new Map(),
    attenuation,
    maxEntries
  });
}

function lineageMap(store, lineageId) {
  if (!store.risks.has(lineageId)) store.risks.set(lineageId, new Map());
  return store.risks.get(lineageId);
}

function pruneLineage(store, lineageId) {
  const map = lineageMap(store, lineageId);
  if (map.size <= store.maxEntries) return;
  const entries = [...map.entries()].sort((a, b) => a[1].risk - b[1].risk);
  const toDrop = map.size - store.maxEntries;
  for (let i = 0; i < toDrop; i += 1) map.delete(entries[i][0]);
}

function propagate(store, context) {
  const { sourceId, targetId, risk, lineageId, depth = 0 } = context;
  if (!sourceId || !targetId || !lineageId || typeof risk !== 'number') return false;
  const map = lineageMap(store, lineageId);
  if (map.size >= store.maxEntries && !map.has(targetId)) pruneLineage(store, lineageId);
  const inherited = Math.max(0, Math.min(1, risk)) * Math.pow(store.attenuation, depth);
  map.set(targetId, {
    sourceId,
    risk: inherited,
    inheritedAt: Date.now(),
    depth
  });
  return true;
}

function getRisk(store, agentId, lineageId) {
  if (!lineageId) return null;
  const map = lineageMap(store, lineageId);
  const entry = map.get(agentId);
  if (!entry) return null;
  return { agentId, sourceId: entry.sourceId, risk: entry.risk,
    depth: entry.depth, inheritedAt: entry.inheritedAt };
}

function decay(store, lineageId, factor) {
  if (!lineageId || typeof factor !== 'number') return 0;
  const map = lineageMap(store, lineageId);
  let count = 0;
  for (const entry of map.values()) {
    entry.risk = Math.max(0, entry.risk * factor);
    count += 1;
  }
  return count;
}

function stats(store) {
  let total = 0;
  let lineagesCount = 0;
  for (const map of store.risks.values()) {
    if (map.size > 0) lineagesCount += 1;
    total += map.size;
  }
  return { total, lineages: lineagesCount, maxEntries: store.maxEntries,
    attenuation: store.attenuation };
}

module.exports = { createStore, propagate, getRisk, decay, stats,
  DEFAULT_ATTENUATION, MAX_ENTRIES };
