function createMigrationRunner(name, description, fn) {
  return { name, description, run: fn };
}

const migrationRunners = [
  createMigrationRunner('002-strategy-contracts', 'Add versioned orchestrator strategy contracts', async (db) => { /* Migration 002 logic */ }),
  createMigrationRunner('003-tenant-scopes', 'Add organization, project and membership isolation', async (db) => { /* Migration 003 logic */ }),
  createMigrationRunner('004-evaluation-job-retries', 'Persist evaluation job retries and terminal errors', async (db) => { /* Migration 004 logic */ }),
  createMigrationRunner('005-agent-authority', 'Require an orchestrator to dispatch worker agents', async (db) => { /* Migration 005 logic */ }),
  createMigrationRunner('006-agent-blocked-status', 'Allow guarded agent missions to persist a blocked status', async (db) => { /* Migration 006 logic */ }),
  createMigrationRunner('007-durable-cryptobiosis', 'Persist cryptobiosis state across backend restarts', async (db) => { /* Migration 007 logic */ }),
  createMigrationRunner('008-tenant-workspace-names', 'Scope workspace name uniqueness to organization and project', async (db) => { /* Migration 008 logic */ }),
  createMigrationRunner('009-agent-completed-status', 'Distinguish successful completion from idle availability and blocked termination', async (db) => { /* Migration 009 logic */ }),
  createMigrationRunner('010-temporal-synapses', 'Persist neurotransmitter and spike timing for synaptic plasticity', async (db) => { /* Migration 010 logic */ }),
  createMigrationRunner('011-project-lifecycle', 'Persist active and archived project lifecycle state', async (db) => { /* Migration 011 logic */ }),
  createMigrationRunner('012-agent-runtime-pid', 'Persist runtime process ownership across cluster workers', async (db) => { /* Migration 012 logic */ }),
  createMigrationRunner('013-durable-cryptobiosis', 'Persist durable cryptobiosis capsule references', async (db) => { /* Migration 013 logic */ }),
  createMigrationRunner('014-episodic-memories', 'Add dedicated episodic memories persistence and indexing', async (db) => { /* Migration 014 logic */ }),
  createMigrationRunner('015-synapse-indexes', 'Add B-Tree indexes on memory_synapses for target, weight, pruning and tenant scoping', async (db) => { /* Migration 015 logic */ }),
  createMigrationRunner('016-workflow-version-snapshots', 'Persist immutable workflow definitions for queued and historical runs', async (db) => { /* Migration 016 logic */ }),
  createMigrationRunner('017-reversible-episodic-retention', 'Keep purged episodic memories as restorable tombstones', async (db) => { /* Migration 017 logic */ }),
  createMigrationRunner('018-ide-client-identity', 'Persist IDE client identity for idempotent reconnection', async (db) => { /* Migration 018 logic */ }),
  createMigrationRunner('019-biopolymer-blobs', 'Migrate JSON text columns to binary bio-polymer BLOBs', async (db) => {
    const { migrateAllBioPolymers } = require('../../services/bioPolymerPersistenceService');
    await migrateAllBioPolymers(db);
  }),
];

async function runMigration(db, version, description) {
  await db.run('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)', version, description);
}

module.exports = { migrationRunners, runMigration };
