'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');
const { VARIANTS } = require('../src/services/metapopulation/policy/metapopulationPolicyService');
const service = require('../src/services/topologySnapshotService');

service.registerAdapter('metapopulation', require('../src/services/topologySnapshots/metapopulation'));

const context = { db: null, scope: { clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org-1', 'project-1'] },
  topologyId: 'metapopulation', variantId: 'balanced', sessionId: 'metapop-1',
  agentId: 'agent-1', workspaceId: 'workspace-1', workerKind: 'bounded_worker' };

async function seed(db) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT);
    INSERT INTO workspaces VALUES ('workspace-1', '/workspace/root', 'org-1', 'project-1');
    INSERT INTO agents VALUES ('agent-1', 'workspace-1');
    INSERT INTO mission_agents VALUES ('mission-1', 'agent-1');`);
  await migrateMetapopulationRuntime(db);
  await db.run(`INSERT INTO metapopulation_sessions
    (id, mission_id, mission, organization, scope, status, generation, revision,
      migration_graph_json, regional_memory_json, variant, variant_policy_json,
      variant_selection_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'metapop-1', 'mission-1', 'test', 'quorum_with_abstention', 'workspace', 'QUIESCENT', 1, 1,
  '{}', '{}', 'balanced', JSON.stringify(VARIANTS.balanced), '{}', '2026-10-10T10:00:00Z', '2026-10-10T10:00:00Z');
  await db.run(`INSERT INTO metapopulation_demes
    (deme_id, metapopulation_id, patch_id, status, members_json, local_strategies_json,
      local_procedures_json, lineage_json, updated_at, workspace_path, workspace_owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'deme-1', 'metapop-1', 'patch-1', 'ACTIVE',
  '["agent-1"]', '[]', '[]', '{}', '2026-10-10T10:00:00Z', '/workspace/root/deme-1', 'agent-1');
  await db.run(`INSERT INTO metapopulation_events
    (metapopulation_id, sequence, revision, event_type, payload_json, provenance_json, actor, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 'metapop-1', 1, 1, 'SESSION_CREATED', '{}', '{}', 'agent-1', '2026-10-10T10:00:00Z');
}

async function expectRefusal(action, code) {
  await assert.rejects(action, (error) => error.code === code);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  context.db = db;
  try {
    await seed(db);
    for (const variant of Object.keys(VARIANTS)) {
      await db.run('UPDATE metapopulation_sessions SET variant = ?, variant_policy_json = ? WHERE id = ?',
        variant, JSON.stringify(VARIANTS[variant]), context.sessionId);
      const request = { ...context, variantId: variant };
      const manifest = await service.capture(request);
      assert.equal(manifest.components.find((item) => item.id === 'variant-policy').payload.variant, variant);
      assert.equal(manifest.components.find((item) => item.id === 'migrations').status, 'reference-only');
      assert.equal(manifest.boundary.eventFrontier.sequence, 1);
      const result = await service.preflightRestore({ ...request, manifest });
      assert.equal(result.allowed, true);
      assert.equal(result.restorable, false);
      assert.equal(result.adapterPlan.receiverLocalValidation, true);
    }
    await db.run('UPDATE metapopulation_sessions SET variant = ?, variant_policy_json = ? WHERE id = ?',
      'balanced', JSON.stringify(VARIANTS.balanced), context.sessionId);
    const catalog = require('../src/services/morphogenesis/registry/variantCatalog');
    for (const entry of catalog.topologyVariants('metapopulation')) {
      assert.equal(entry.maturity, 'implemented', entry.variantId);
    }
    const manifest = await service.capture(context);
    const defaultManifest = await service.capture({ ...context, variantId: 'default' });
    assert.equal(defaultManifest.components.find((item) => item.id === 'variant-policy').payload.variant,
      'balanced');
    assert.equal(defaultManifest.bindings.workerKind, 'bounded_worker');
    await db.run("UPDATE metapopulation_demes SET budget_json = '{\"tokens\":1}' WHERE deme_id = 'deme-1'");
    await expectRefusal(() => service.preflightRestore({ ...context, manifest }), 'TOPOLOGY_SNAPSHOT_DRIFT');
    await expectRefusal(() => service.capture({ ...context, agentId: 'agent-2' }), 'METAPOPULATION_SNAPSHOT_OWNER_MISMATCH');
    await expectRefusal(() => service.capture({ ...context, scope: { clause: 'w.organization_id = ?', params: ['other'] } }),
      'METAPOPULATION_SNAPSHOT_OWNER_MISMATCH');
    await db.run("UPDATE metapopulation_sessions SET status = 'ACTIVE' WHERE id = 'metapop-1'");
    await expectRefusal(() => service.capture(context), 'METAPOPULATION_SNAPSHOT_ACTIVE');
    await db.run("UPDATE metapopulation_sessions SET status = 'QUIESCENT' WHERE id = 'metapop-1'");
    await db.run("INSERT INTO metapopulation_patches (patch_id, metapopulation_id, carrying_capacity, quality, accessibility, status, created_at, updated_at) VALUES ('patch-1', 'metapop-1', 1, 1, 1, 'OCCUPIED', '', '')");
    await db.run("INSERT INTO ephemeral_leases (lease_id, metapopulation_id, patch_id, created_at, expires_at) VALUES ('lease-1', 'metapop-1', 'patch-1', '2026-10-10T10:00:00Z', '9999-01-01T00:00:00Z')");
    await expectRefusal(() => service.capture(context), 'METAPOPULATION_SNAPSHOT_IN_FLIGHT');
    console.log(`Metapopulation topology snapshots: ${Object.keys(VARIANTS).length} variants pass`);
  } finally { await db.close(); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
