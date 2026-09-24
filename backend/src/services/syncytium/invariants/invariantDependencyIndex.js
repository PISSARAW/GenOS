'use strict';

function compile(registry) {
  const index = { exact: {}, patterns: [], global: [] };
  for (const invariant of Object.values(registry || {})) {
    const paths = [...new Set([...(invariant.dependencies || []), ...(invariant.scope || [])])];
    if (!paths.length) index.global.push(invariant.invariantId);
    for (const path of paths) addPath(index, path, invariant.invariantId);
  }
  return index;
}

function addPath(index, path, invariantId) {
  if (path.includes('*')) {
    index.patterns.push({ path, invariantId });
    return;
  }
  index.exact[path] = index.exact[path] || [];
  index.exact[path].push(invariantId);
}

function affected(index, path) {
  const ids = [...(index?.global || []), ...(index?.exact?.[path] || [])];
  for (const entry of index?.patterns || []) {
    if (matches(entry.path, path)) ids.push(entry.invariantId);
  }
  return [...new Set(ids)];
}

function matches(pattern, path) {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

module.exports = { compile, affected };
