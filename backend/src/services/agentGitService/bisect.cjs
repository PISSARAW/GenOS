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
  path.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return path;
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

module.exports = { bisect, buildCausalPath, runBinarySearch };
