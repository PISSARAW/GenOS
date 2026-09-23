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
  const isGood = (object) => JSON.stringify(value(object)) === JSON.stringify(expected);

  const outcome = runDagBisect({ candidates: causalPath, isGood });

  return {
    success: true,
    operation: 'bisect',
    goodCommitId: goodId,
    badCommitId: badId,
    field,
    expectedValue: expected,
    anomalyFound: outcome.culpritIndex >= 0,
    culpritObjectId: outcome.culpritIndex >= 0 ? causalPath[outcome.culpritIndex].id : null,
    causalPathLength: causalPath.length,
    iterations: outcome.iterations,
    complexity: `O(${outcome.iterations} tests, <= ${causalPath.length} eliminations)`
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

function topologicalSort(commits) {
  const byId = new Map(commits.map(c => [c.id, c]));
  const depthCache = new Map();
  const depthOf = (commit, seen = new Set()) => {
    if (depthCache.has(commit.id)) return depthCache.get(commit.id);
    if (seen.has(commit.id)) return 0;
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

function buildAncestorIndex(candidates) {
  const byId = new Map(candidates.map(c => [c.id, c]));
  const index = new Map();
  for (const candidate of candidates) {
    index.set(candidate.id, collectAncestorIds({ start: candidate, byId }));
  }
  return index;
}

function collectAncestorIds(ctx) {
  const { start, byId } = ctx;
  const seen = new Set([start.id]);
  const stack = [...(start.parentIds || [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) stack.push(...(node.parentIds || []));
  }
  return seen;
}

function pickPivot(ctx) {
  const { candidates, ancestorIndex, tested } = ctx;
  const total = candidates.length;
  let best = null;
  let bestScore = -2;
  for (const candidate of candidates) {
    if (tested && tested.has(candidate.id)) continue;
    const count = countInSet({ ancestorSet: ancestorIndex.get(candidate.id), candidates });
    const score = Math.min(count, total - count);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best || candidates[0];
}

function countInSet(ctx) {
  const { ancestorSet, candidates } = ctx;
  let count = 0;
  for (const c of candidates) if (ancestorSet.has(c.id)) count += 1;
  return count;
}

function runDagBisect(ctx) {
  const { candidates, isGood } = ctx;
  const ancestorIndex = buildAncestorIndex(candidates);
  let remaining = [...candidates];
  const tested = new Set();
  let iterations = 0;
  while (remaining.length > 1) {
    const pivot = pickPivot({ candidates: remaining, ancestorIndex, tested });
    iterations += 1;
    tested.add(pivot.id);
    const next = isGood(pivot)
      ? eliminateAncestors({ remaining, pivot, ancestorIndex })
      : keepAncestors({ remaining, pivot, ancestorIndex });
    if (next.length === remaining.length) {
      if (tested.size >= remaining.length) break;
      continue;
    }
    remaining = next;
    if (iterations > candidates.length * 2) break;
  }
  return finishBisect({ candidates, remaining, iterations, isGood });
}

function eliminateAncestors(ctx) {
  const { remaining, pivot, ancestorIndex } = ctx;
  const gone = ancestorIndex.get(pivot.id);
  return remaining.filter(c => !gone.has(c.id));
}

function keepAncestors(ctx) {
  const { remaining, pivot, ancestorIndex } = ctx;
  const kept = ancestorIndex.get(pivot.id);
  return remaining.filter(c => kept.has(c.id));
}

function finishBisect(ctx) {
  const { candidates, remaining, iterations, isGood } = ctx;
  if (remaining.length === 0) return { culpritIndex: -1, iterations };
  const last = remaining[remaining.length - 1];
  if (isGood(last)) return { culpritIndex: -1, iterations };
  return { culpritIndex: candidates.findIndex(c => c.id === last.id), iterations };
}

function runBinarySearch(sortedArray, predicate) {
  const outcome = runDagBisect({ candidates: sortedArray, isGood: predicate });
  return { culprit: outcome.culpritIndex, iterations: outcome.iterations };
}

module.exports = { bisect, buildCausalPath, runBinarySearch, runDagBisect, topologicalSort };
