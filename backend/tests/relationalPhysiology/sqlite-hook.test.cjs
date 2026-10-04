'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { excludeKnownDependentAudience } = require('../../src/services/relationalPhysiology/legacyAudienceGate');

function database() {
  const sqlite = new DatabaseSync(':memory:');
  // Real SQLite queries, using the exact columns consumed from agent_relations.
  // This is NOT a test of GenOS's complete migration/bootstrap chain.
  sqlite.exec(`CREATE TABLE agent_relations (
    id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, target_agent_id TEXT NOT NULL,
    relation_type TEXT NOT NULL, organization_id TEXT, project_id TEXT)`);
  return {
    sqlite,
    all: async (sql, args) => sqlite.prepare(sql).all(...args),
    add: (row) => sqlite.prepare('INSERT INTO agent_relations VALUES (?, ?, ?, ?, ?, ?)').run(...row)
  };
}
function request(db, extra = {}) {
  return {
    db, organizationId: 'org', projectId: 'project',
    intent: { senderAgentId: 'A', independenceRequired: true, risk: 'low' },
    ...extra
  };
}
const candidates = [{ agentId: 'B' }, { agentId: 'C' }];

test('SQL hook rejects shared ancestors, including a non-candidate intermediary', async () => {
  const db = database();
  try {
    db.add(['a', 'Z', 'A', 'parent', 'org', 'project']);
    db.add(['b', 'Z', 'B', 'parent', 'org', 'project']);
    const result = await excludeKnownDependentAudience(request(db), candidates);
    assert.deepEqual(result.map((item) => item.agentId), ['C']);
  } finally { db.sqlite.close(); }
});
test('SQL hook uses exact organization AND project scoping', async () => {
  const db = database();
  try {
    db.add(['a', 'A', 'B', 'twin', 'org', 'another-project']);
    db.add(['b', 'A', 'C', 'twin', 'another-org', 'project']);
    assert.equal((await excludeKnownDependentAudience(request(db), candidates)).length, 2);
  } finally { db.sqlite.close(); }
});
test('NULL scope is not a wildcard', async () => {
  const db = database();
  try {
    db.add(['a', 'A', 'B', 'twin', null, null]);
    assert.equal((await excludeKnownDependentAudience(request(db), candidates)).length, 2);
    const result = await excludeKnownDependentAudience(request(db, { organizationId: null, projectId: null }), candidates);
    assert.deepEqual(result.map((item) => item.agentId), ['C']);
  } finally { db.sqlite.close(); }
});
test('ordinary communication performs no extra relation query', async () => {
  const db = { all: async () => { throw new Error('must-not-query'); } };
  const result = await excludeKnownDependentAudience(request(db, { intent: { senderAgentId: 'A', independenceRequired: false } }), candidates);
  assert.strictEqual(result, candidates);
});
test('partial graph loads are rejected, never treated as no relation', async () => {
  const db = { all: async () => Array.from({ length: 2049 }, () => ({})) };
  await assert.rejects(excludeKnownDependentAudience(request(db), candidates), /RPE_SCOPE_GRAPH_TOO_LARGE/);
});
test('relation store failure is not swallowed by the hook', async () => {
  const db = { all: async () => { throw new Error('database-down'); } };
  await assert.rejects(excludeKnownDependentAudience(request(db), candidates), /database-down/);
});
function patchedRoute() {
  const filename = path.resolve(__dirname, '../../src/services/communication/relationshipCommunicationRoutingService.js');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (name) => name === './relationshipCommunicationProfileService'
    ? { deriveProfile: async () => ({ epistemicIndependence: 1, disclosureLevel: 1 }) }
    : originalRequire(name);
  mod._compile(fs.readFileSync(filename, 'utf8'), filename);
  return mod.exports;
}
test('actual patched routing function rejects lineage despite optimistic profile presets', async () => {
  const db = database();
  try {
    db.add(['a', 'A', 'Z', 'child', 'org', 'project']);
    db.add(['b', 'Z', 'B', 'parent', 'org', 'project']);
    const route = patchedRoute();
    const result = await route.profileAudience({ ...request(db), candidates });
    assert.deepEqual(result.map((item) => item.agentId), ['C']);
  } finally { db.sqlite.close(); }
});
