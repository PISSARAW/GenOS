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
  createMigrationRunner('020-structural-knowledge-graph', 'Add knowledge_graph_relations, learned_traits tables and synapse consolidation columns', async (db) => {
    const { migrateStructuralKnowledgeGraph } = require('./migrateStructuralKnowledgeGraph');
    await migrateStructuralKnowledgeGraph(db);
  }),
  createMigrationRunner('021-signal-transport', 'Add zero-text signaling tables (signal_blobs, signal_subs) for inter-agent transport', async (db) => {
    const { applyV45Migration } = require('../schema-next');
    await applyV45Migration(db);
  }),
  createMigrationRunner('022-adaptive-state', 'Persist adaptive state (Q-values, attractions, stigmergy) across restarts', async (db) => {
    const { migrateAdaptiveState } = require('./migrateAdaptiveState');
    await migrateAdaptiveState(db);
  }),
  createMigrationRunner('023-autobiographical-memory', 'Add autobiographical episodes, consolidated lessons and per-agent self-models', async (db) => {
    const { migrateAutobiographicalMemory } = require('./migrateAutobiographicalMemory');
    await migrateAutobiographicalMemory(db);
  }),
  createMigrationRunner('024-ontology', 'Add ontology tables for beings, attributes, modes, mereology, hypostatization, identity', async (db) => {
    const { createOntologyTables, ensureOntologyColumns } = require('./migrateOntology');
    await createOntologyTables(db);
    await ensureOntologyColumns(db);
  }),
  createMigrationRunner('025-ontology-relations', 'Add typed, provenance-aware generic ontology relations', async (db) => {
    const { createOntologyRelationTables } = require('./migrateOntologyRelations');
    await createOntologyRelationTables(db);
  }),
  createMigrationRunner('026-philosophy-analyses', 'Persist explicitly saved philosophical analyses with provenance', async (db) => {
    const { createPhilosophyAnalysisTables } = require('./migratePhilosophyAnalyses');
    await createPhilosophyAnalysisTables(db);
  }),
  createMigrationRunner('027-durable-agent-coordination', 'Persist cross-agent relations, collective decisions, continuations and survival wake conditions', async (db) => {
    const { migrateDurableAgentCoordination } = require('./migrateDurableAgentCoordination');
    await migrateDurableAgentCoordination(db);
  }),
  createMigrationRunner('028-epistemic-events', 'Persist epistemic events and revision claims', async (db) => {
    const { migrateEpistemicEvents } = require('./migrateEpistemicEvents');
    await migrateEpistemicEvents(db);
  }),
  createMigrationRunner('029-ontology-concepts', 'Persist continuity observations and possible worlds', async (db) => {
    const { migrateOntologyConcepts } = require('./migrateOntologyConcepts');
    await migrateOntologyConcepts(db);
  }),
  createMigrationRunner('030-ontology-relation-scopes', 'Scope generic ontology relations by tenant', async (db) => {
    const { migrateOntologyRelationScopes } = require('./migrateOntologyRelationScopes');
    await migrateOntologyRelationScopes(db);
  }),
  createMigrationRunner('031-ontology-world-receipts', 'Persist hashes and verification status for possible-world receipts', async (db) => {
    const { migrateOntologyWorldReceipts } = require('./migrateOntologyWorldReceipts');
    await migrateOntologyWorldReceipts(db);
  }),
  createMigrationRunner('032-survival-state', 'Persist orchestrator survival states and transition events', async (db) => {
    const { migrateSurvivalState } = require('./migrateSurvivalState');
    await migrateSurvivalState(db);
  }),
];

async function runMigration(db, version, description) {
  const runner = migrationRunners.find((r) => r.name === version);
  if (runner) {
    await runner.run(db);
  }
  await db.run('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)', version, description);
}

module.exports = { migrationRunners, runMigration };
