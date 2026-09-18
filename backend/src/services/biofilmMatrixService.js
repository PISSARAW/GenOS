'use strict';

function createMatrix(matrixId, options = {}) {
  return {
    matrixId: String(matrixId || `matrix-${Date.now()}`),
    version: 0,
    maxEntries: Math.max(10, Number(options.maxEntries) || 1000),
    entries: new Map(),
    history: []
  };
}

function deposit(matrix, entry) {
  if (!matrix || !entry?.key) throw new Error('A matrix and entry key are required.');
  matrix.version += 1;
  const value = { ...entry, version: matrix.version, depositedAt: Date.now() };
  matrix.entries.set(String(entry.key), value);
  matrix.history.push(value);
  while (matrix.history.length > matrix.maxEntries) matrix.history.shift();
  return value;
}

function read(matrix, selector = {}) {
  const values = [...(matrix?.entries?.values() || [])];
  return values.filter((entry) => {
    if (selector.clusterId && entry.clusterId !== selector.clusterId) return false;
    if (selector.kind && entry.kind !== selector.kind) return false;
    return !selector.afterVersion || entry.version > selector.afterVersion;
  });
}

function compact(matrix, keepKinds = []) {
  const keep = new Set(keepKinds);
  for (const [key, entry] of matrix.entries) {
    if (!keep.has(entry.kind) && entry.version < matrix.version - 100) matrix.entries.delete(key);
  }
  return { matrixId: matrix.matrixId, version: matrix.version, entries: matrix.entries.size };
}

module.exports = { createMatrix, deposit, read, compact };
