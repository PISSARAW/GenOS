'use strict';
const { isVersionedCulture } = require('../migration/migrationPolicyService');
const { randomUUID } = require('crypto');

const cultureRegistry = new Map();
const transmissionLog = [];
const phylogenyNodes = new Map();

function registerCulture(culture, author) {
  if (!culture || !culture.id) throw new Error('Culture must have an id');
  const existing = cultureRegistry.get(culture.id);
  if (existing && existing.version >= culture.version) return existing;
  const entry = {
    ...culture,
    id: culture.id,
    version: culture.version || 1,
    parentRefs: culture.parentRefs || [],
    author: author || 'unknown',
    registeredAt: new Date().toISOString(),
    transmissionCount: 0,
  };
  cultureRegistry.set(culture.id, entry);
  return entry;
}

function transmitCulture(context) {
  const { cultureId, sourceDemeId, targetDemeId, mode } = context;
  const culture = cultureRegistry.get(cultureId);
  if (!culture) return { transmitted: false, reason: 'CULTURE_NOT_FOUND' };
  const transmission = {
    transmissionId: `tx-${randomUUID()}`,
    cultureId,
    sourceDemeId,
    targetDemeId,
    mode: mode || 'horizontal',
    transmittedAt: new Date().toISOString(),
    compatible: true,
  };
  transmissionLog.push(transmission);
  culture.transmissionCount = (culture.transmissionCount || 0) + 1;
  return transmission;
}

function mutateCultureLocally(cultureId, mutation, mutatorId) {
  const culture = cultureRegistry.get(cultureId);
  if (!culture) return { mutated: false, reason: 'CULTURE_NOT_FOUND' };
  const newVersion = culture.version + 1;
  const mutated = {
    ...culture,
    version: newVersion,
    parentRefs: [...(culture.parentRefs || []), cultureId],
    lastMutator: mutatorId,
    lastMutationAt: new Date().toISOString(),
    mutation,
  };
  cultureRegistry.set(cultureId, mutated);
  return { mutated: true, cultureId, newVersion, mutation };
}

function buildCulturalPhylogeny(cultureIds) {
  const roots = [];
  for (const id of cultureIds) {
    const culture = cultureRegistry.get(id);
    if (!culture) continue;
    if (!culture.parentRefs || culture.parentRefs.length === 0) roots.push(culture);
    const node = {
      cultureId: id,
      version: culture.version,
      parents: culture.parentRefs || [],
      children: [],
      depth: 0,
    };
    phylogenyNodes.set(id, node);
  }
  for (const [id, node] of phylogenyNodes) {
    for (const parentId of node.parents) {
      const parent = phylogenyNodes.get(parentId);
      if (parent) {
        parent.children.push(id);
        node.depth = Math.max(node.depth, parent.depth + 1);
      }
    }
  }
  return { roots: roots.map((r) => r.id), nodes: [...phylogenyNodes.values()], count: phylogenyNodes.size };
}

function cultureProvenance(cultureId) {
  const culture = cultureRegistry.get(cultureId);
  if (!culture) return null;
  return {
    cultureId,
    version: culture.version,
    author: culture.author,
    parentRefs: culture.parentRefs || [],
    firstRegistered: culture.registeredAt,
    transmissionCount: culture.transmissionCount || 0,
  };
}

module.exports = { registerCulture, transmitCulture, mutateCultureLocally, buildCulturalPhylogeny, cultureProvenance };
