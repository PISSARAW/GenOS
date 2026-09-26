'use strict';
const { buildCorridors } = require('./corridorTopologyService');

function validateLocalityConstraint(migration, demeIds) {
  const sourceIdx = demeIds.indexOf(migration.sourceDemeId);
  const targetIdx = demeIds.indexOf(migration.targetDemeId);
  if (sourceIdx === -1 || targetIdx === -1) return { valid: false, reason: 'UNKNOWN_DEME' };
  const distance = Math.abs(sourceIdx - targetIdx);
  const length = demeIds.length;
  const maxDistance = Math.ceil(length / 2);
  if (distance > 1 && distance < length - 1) {
    return { valid: false, reason: 'NON_LOCAL_JUMP', distance, maxLocal: 1 };
  }
  return { valid: true, distance };
}

function handleBridgeExtinction(bridgeDemeId, demes, corridors) {
  const bridge = demes.find((d) => d.demeId === bridgeDemeId);
  if (!bridge || bridge.status !== 'COLLAPSED') return { action: 'NONE', reason: 'NOT_COLLAPSED' };
  const adjacent = corridors.filter((c) => c.sourceDemeId === bridgeDemeId || c.targetDemeId === bridgeDemeId);
  const isolated = demes.filter((d) => {
    const conn = corridors.some((c) => (c.sourceDemeId === d.demeId || c.targetDemeId === d.demeId) && c.enabled);
    return !conn;
  });
  return {
    action: isolated.length > 0 ? 'CREATE_BRIDGE_ALT' : 'NOTIFY',
    collapsedBridge: bridgeDemeId,
    adjacentCorridorsLost: adjacent.length,
    isolatedDemes: isolated.map((d) => d.demeId),
  };
}

function enforceNoveltyCulturalOnly(migration) {
  const allowed = new Set(['novelty', 'cultural', 'counterexample']);
  if (!allowed.has(migration.policy)) {
    return { allowed: false, reason: `POLICY_NOT_ALLOWED: ${migration.policy}. Stepping-stone only permits novelty/cultural/counterexample.` };
  }
  return { allowed: true };
}

module.exports = { validateLocalityConstraint, handleBridgeExtinction, enforceNoveltyCulturalOnly };
