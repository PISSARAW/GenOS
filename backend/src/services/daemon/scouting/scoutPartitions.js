'use strict';

/**
 * Scout partition helpers — extracted from scoutColonyService for line limit.
 */

const graphStore = require('../cartography/graphStore');

function fallbackPartitions(strategy) {
  const partitions = {
    'architecture': [
      { id: 'partition.core', type: 'module', scope: 'src/core/' },
      { id: 'partition.services', type: 'module', scope: 'src/services/' },
      { id: 'partition.api', type: 'module', scope: 'src/api/' },
      { id: 'partition.utils', type: 'module', scope: 'src/utils/' },
      { id: 'partition.config', type: 'config', scope: 'config/' }
    ],
    'git-history': [
      { id: 'partition.recent', type: 'temporal', scope: 'last-7d' },
      { id: 'partition.stable', type: 'temporal', scope: '30d-90d' },
      { id: 'partition.legacy', type: 'temporal', scope: '>90d' }
    ],
    'tests': [
      { id: 'partition.unit', type: 'test-type', scope: '*.test.*' },
      { id: 'partition.integration', type: 'test-type', scope: '*.integration.*' },
      { id: 'partition.e2e', type: 'test-type', scope: '*.e2e.*' }
    ],
    'by-path': [
      { id: 'partition.backend', type: 'path', scope: 'backend/' },
      { id: 'partition.crates', type: 'path', scope: 'crates/' },
      { id: 'partition.mcp', type: 'path', scope: 'mcp/' }
    ],
    'by-symbol': [
      { id: 'partition.functions', type: 'symbol', scope: 'function-decl' },
      { id: 'partition.classes', type: 'symbol', scope: 'class-decl' },
      { id: 'partition.imports', type: 'symbol', scope: 'import-graph' }
    ]
  };
  return partitions[strategy] || [{ id: 'partition.default', type: 'full', scope: '/' }];
}

function mergePartitions(partitions, maxCells) {
  const merged = [];
  const chunkSize = Math.ceil(partitions.length / maxCells);
  for (let i = 0; i < partitions.length; i += chunkSize) {
    const chunk = partitions.slice(i, i + chunkSize);
    merged.push({
      id: `partition.merged-${i}`, type: 'merged',
      scope: chunk.map((p) => p.scope).join(','),
      mergedFrom: chunk.map((p) => p.id)
    });
  }
  return merged;
}

async function getBasePartitions(db, territory, strategy) {
  if (!db) return fallbackPartitions(strategy);
  try {
    const nodes = await graphStore.listNodes(db, { territoryId: territory.id });
    if (!nodes || nodes.length === 0) return fallbackPartitions(strategy);
    const fileNodes = nodes.filter((n) => n.kind === 'file');
    if (fileNodes.length === 0) return fallbackPartitions(strategy);
    const dirs = new Set();
    for (const node of fileNodes) {
      const parts = node.path.split('/');
      if (parts.length > 1) dirs.add(parts[0] + '/');
    }
    const dirPartitions = Array.from(dirs).slice(0, 20).map((dir, i) => ({
      id: `partition.graph.${i}`, type: 'directory', scope: dir
    }));
    if (dirPartitions.length > 0) return dirPartitions;
  } catch (_) {
    // fall through to fallback
  }
  return fallbackPartitions(strategy);
}

async function computePartitions(input) {
  const { db, territory, strategy, maxCells } = input;
  const base = await getBasePartitions(db, territory, strategy);
  return base.length <= maxCells ? base : mergePartitions(base, maxCells);
}

module.exports = {
  fallbackPartitions,
  mergePartitions,
  getBasePartitions,
  computePartitions
};
