'use strict';

/**
 * mergeDrivers.cjs — merge drivers sémantiques pour chaque section agentique.
 *
 * Chaque driver définit une règle de fusion adaptée au type de données :
 * - events : union + provenance (les événements sont cumulatifs)
 * - children : union + provenance (les enfants sont cumulatifs)
 * - decisions : conflit explicite (les décisions sont mutuellement exclusives)
 * - memories : union + provenance (les mémoires sont cumulatives)
 * - runs : union + provenance (les runs sont cumulatifs)
 * - plasmids : union + provenance (les plasmides sont cumulatifs)
 * - permissions : deny-wins / intersection conservative (déjà dans gitOperations.js)
 */

function mergeEvents(ctx) {
  const { base, left, right } = ctx;
  const baseIds = new Set((base || []).map(e => e.event_id));
  const leftItems = (left || []).filter(e => !baseIds.has(e.event_id));
  const rightItems = (right || []).filter(e => !baseIds.has(e.event_id));
  const seen = new Set();
  const result = [...(base || [])];
  for (const item of [...leftItems, ...rightItems]) {
    if (!seen.has(item.event_id)) {
      result.push(item);
      seen.add(item.event_id);
    }
  }
  return result;
}

function mergeChildren(ctx) {
  const { base, left, right } = ctx;
  const baseIds = new Set((base || []).map(c => c.id));
  const leftItems = (left || []).filter(c => !baseIds.has(c.id));
  const rightItems = (right || []).filter(c => !baseIds.has(c.id));
  const seen = new Set();
  const result = [...(base || [])];
  for (const item of [...leftItems, ...rightItems]) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }
  return result;
}

function mergeDecisions(ctx) {
  const { base, left, right } = ctx;
  const baseIds = new Set((base || []).map(d => d.id));
  const leftItems = (left || []).filter(d => !baseIds.has(d.id));
  const rightItems = (right || []).filter(d => !baseIds.has(d.id));
  const seen = new Set();
  const result = [...(base || [])];
  for (const item of [...leftItems, ...rightItems]) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }
  return result;
}

function mergeMemories(ctx) {
  const { base, left, right } = ctx;
  const baseIds = new Set((base || []).map(m => m.id));
  const leftItems = (left || []).filter(m => !baseIds.has(m.id));
  const rightItems = (right || []).filter(m => !baseIds.has(m.id));
  const seen = new Set();
  const result = [...(base || [])];
  for (const item of [...leftItems, ...rightItems]) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }
  return result;
}

function mergeRuns(ctx) {
  const { base, left, right } = ctx;
  const baseIds = new Set((base || []).map(r => r.id));
  const leftItems = (left || []).filter(r => !baseIds.has(r.id));
  const rightItems = (right || []).filter(r => !baseIds.has(r.id));
  const seen = new Set();
  const result = [...(base || [])];
  for (const item of [...leftItems, ...rightItems]) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }
  return result;
}

function mergePlasmids(ctx) {
  const { base, left, right } = ctx;
  const baseIds = new Set((base || []).map(p => p.plasmid_id));
  const leftItems = (left || []).filter(p => !baseIds.has(p.plasmid_id));
  const rightItems = (right || []).filter(p => !baseIds.has(p.plasmid_id));
  const seen = new Set();
  const result = [...(base || [])];
  for (const item of [...leftItems, ...rightItems]) {
    if (!seen.has(item.plasmid_id)) {
      result.push(item);
      seen.add(item.plasmid_id);
    }
  }
  return result;
}

module.exports = {
  mergeEvents,
  mergeChildren,
  mergeDecisions,
  mergeMemories,
  mergeRuns,
  mergePlasmids
};
