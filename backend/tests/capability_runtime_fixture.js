'use strict';
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const artifacts = require('../src/services/morphogenesis/capabilities/runtimeArtifacts');
async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');
  await require('../src/db/migrations/migrateMorphogenesisCapabilities').migrateMorphogenesisCapabilities(db);
  await require('../src/db/migrations/migrateCapabilityRuntime').migrateCapabilityRuntime(db);
  return db;
}
function scoped(db, scopeId) {
  return { scopeId, resolveArtifact: artifacts.resolver(db, scopeId) };
}
async function proof(db, scopeId, content) {
  return artifacts.put(db, { scopeId, kind: content.kind || 'test-evidence', content });
}
module.exports = { database, scoped, proof, artifacts };
