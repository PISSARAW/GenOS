'use strict';

const { getCommit, collectAncestors } = require('./commitGraph');
const { getDatabase } = require('../../db');

async function bisect(req) {
  const db = await getDatabase();
  const goodId = req.body?.goodObjectId;
  const badId = req.body?.badObjectId;
  const field = String(req.body?.field || '').trim();
  const expected = req.body?.expectedValue;

  if (!goodId || !badId) return { success: false, error: 'Both goodObjectId and badObjectId are required (causal bisect).' };

  const causalPath = await buildCausalPath(db, goodId, badId);
  if (!causalPath || causalPath.length < 2) {
    return { success: false, error: 'At least two commits on the causal path are required.' };
  }

  const value = (object) => String(field).split('.').reduce((current, key) => current == null ? undefined : current[key], JSON.parse(object.state_json));
  const matches = (object) => JSON.stringify(value(object)) === JSON.stringify(expected);

  // Point 11 : recherche binaire valide sur DAG. Le tri par created_at seul ne
  // produit pas d'ordre total monotone dans un graphe avec merges — on tri
  // topologiquement (un commit vient toujours après ses parents), puis la
  // recherche binaire reste correcte : si C[i] est good, tous ses ancêtres
  // le sont aussi.
  const { culprit, iterations } = runBinarySearch(causalPath, matches);

  return {
    success: true,
    operation: 'bisect',
    goodCommitId: goodId,
    badCommitId: badId,
    field,
    expectedValue: expected,
    anomalyFound: culprit >= 0,
    culpritObjectId: culprit >= 0 ? causalPath[culprit].id : null,
    causalPathLength: causalPath.length,
    iterations,
    complexity: `O(log2(${causalPath.length}))`
  };
}

async function buildCausalPath(db, goodId, badId) {
  const goodCommit = await getCommit(db, goodId);
  if (!goodCommit) return null;
  const goodParentId = goodCommit.parentIds && goodCommit.parentIds.length > 0 ? goodCommit.parentIds[0] : null;

  const badAncestors = await collectAncestors(db, badId);
  let goodAncestors = [];
  if (goodParentId) {
    goodAncestors = await collectAncestors(db, goodParentId);
  }
  const goodSet = new Set(goodAncestors.map(a => a.id));

  const path = badAncestors.filter(a => !goodSet.has(a.id));
  return topologicalSort(path);
}

// Tri topologique par profondeur ancestrale : un commit est toujours placé
// après tous ses ancêtres. En cas d'égalité de profondeur (branches
// parallèles), created_at départage — mais l'ordre reste causalement valide,
// ce que created_at seul ne garantit pas (horloges distantes, merges croisés).
function topologicalSort(commits) {
  const byId = new Map(commits.map(c => [c.id, c]));
  const depthCache = new Map();
  const depthOf = (commit, seen = new Set()) => {
    if (depthCache.has(commit.id)) return depthCache.get(commit.id);
    if (seen.has(commit.id)) return 0; // cycle défensif
    seen.add(commit.id);
    let depth = 0;
    for (const parentId of commit.parentIds || []) {
      if (byId.has(parentId)) depth = Math.max(depth, 1 + depthOf(byId.get(parentId), seen));
    }
    depthCache.set(commit.id, depth);
    return depth;
  };
  return commits
    .map(c => ({ commit: c, depth: depthOf(c) }))
    .sort((a, b) => a.depth - b.depth || new Date(a.commit.created_at) - new Date(b.commit.created_at))
    .map(e => e.commit);
}

function runBinarySearch(sortedArray, predicate) {
  let low = 1;
  let high = sortedArray.length - 1;
  let culprit = -1;
  let iterations = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    iterations += 1;
    if (predicate(sortedArray[middle])) {
      low = middle + 1;
    } else {
      culprit = middle;
      high = middle - 1;
    }
  }
  return { culprit, iterations };
}

module.exports = { bisect, buildCausalPath, runBinarySearch, topologicalSort };
