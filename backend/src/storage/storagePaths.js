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

function writeManifest(extra = {}) {
  ensureDirs();
  const manifest = {
    version: 1,
    created_at: new Date().toISOString(),
    files: {
      sqlite: path.relative(ROOT, FILES.sqlite),
      ladybug: path.relative(ROOT, FILES.ladybug),
      duckdb: path.relative(ROOT, FILES.duckdb),
      lancedb: path.relative(ROOT, FILES.lancedb),
    },
    ...extra,
  };
  fs.writeFileSync(FILES.manifest, JSON.stringify(manifest, null, 2));
  return manifest;
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(FILES.manifest, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = { PATHS, FILES, ensureDirs, getProjectRoot, writeManifest, readManifest };
