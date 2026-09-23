'use strict';

const path = require('path');
const fs = require('fs');

/**
 * StoragePaths — single source of truth for all storage paths.
 *
 * All paths are relative to the project root and follow the bundle structure:
 *   .genos/data/
 *     ├── operational/   → genos.db
 *     ├── graph/         → world.lbdb
 *     ├── analytics/     → analytics.duckdb
 *     ├── vectors/       → genos.lance
 *     └── objects/       → sha256/...
 */

const ROOT = path.resolve(__dirname, '../../../.genos/data');

const PATHS = {
  root: ROOT,
  operational: path.join(ROOT, 'operational'),
  graph: path.join(ROOT, 'graph'),
  analytics: path.join(ROOT, 'analytics'),
  vectors: path.join(ROOT, 'vectors'),
  objects: path.join(ROOT, 'objects'),
};

const FILES = {
  sqlite: path.join(PATHS.operational, 'genos.db'),
  ladybug: path.join(PATHS.graph, 'world.lbdb'),
  duckdb: path.join(PATHS.analytics, 'analytics.duckdb'),
  lancedb: path.join(PATHS.vectors, 'genos.lance'),
  manifest: path.join(ROOT, 'manifest.json'),
};

function ensureDirs() {
  for (const dir of Object.values(PATHS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getProjectRoot() {
  return path.resolve(__dirname, '../../../');
}

module.exports = { PATHS, FILES, ensureDirs, getProjectRoot };
