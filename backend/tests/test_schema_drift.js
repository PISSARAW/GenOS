const { getDatabase } = require('../src/db');

// Tables canoniques: créées par schema.js + schema-migrations.js + migrations/registry.js
// À maintenir à chaque nouvelle migration.
const CANONICAL_TABLES = new Set([
  // Core
  'agents', 'agent_runtime_state', 'agent_state_snapshots', 'agent_genomes',
  'agent_genome_innovations', 'agent_phenotype_states',
  // Tenancy
  'organizations', 'projects', 'organization_memberships', 'project_memberships',
  'environments', 'workspaces',
  // Jobs & workflows
  'workflow_runs', 'evaluation_jobs', 'evaluation_campaigns', 'model_jobs', 'model_job_tokens',
  'workflow_versions', 'workflows',
  // Memory
  'memory_synapses', 'episodic_memories', 'genome_decisions', 'rag_chunks',
  'autobiographical_episodes', 'autobiographical_lessons',
  // Trajectories & observability
  'trajectories', 'trace_spans', 'telemetry_events', 'audit_logs',
  'trajectories_fts', 'genome_decisions_fts',
  'trajectories_vec', 'genome_decisions_vec', 'rag_chunks_vec',
  // Governance
  'provider_configs', 'agent_model_routing_policies', 'platform_approvals',
  'compliance_reports', 'strategy_contracts', 'strategy_execution_runs',
  'strategy_execution_steps', 'strategy_portfolio',
  // Biology
  'cryptobiosis_snapshots', 'cryptobiosis_spore_states', 'plasmid_bindings',
  'conscience_transitions', 'fossils', 'fossil_strata',
  // Security & access
  'access_keys', 'users', 'notification_preferences',
  // Epistemic
  'epistemic_events', 'epistemic_revisions', 'epistemic_contradictions',
  'genome_events', 'genome_trusted_signers',
  // Ontology
  'ontology_beings', 'ontology_attributes', 'ontology_modes', 'ontology_mereology',
  'ontology_hypostatizations', 'ontology_identity', 'ontology_relations',
  'ontology_world_receipts', 'ontology_concepts',
  // Daemon (ADR 0034)
  'daemon_territories', 'daemon_events', 'daemon_findings', 'daemon_finding_evidence',
  'daemon_stigmergy_markers', 'daemon_handoffs', 'daemon_handoff_feedback',
  'daemon_repair_episodes', 'daemon_eval_runs', 'daemon_phenotypes',
  'daemon_territory_graph',
  // Coordination & communication
  'agent_relations', 'collective_decisions', 'continuation_queue',
  'survival_wake_conditions', 'communication_outcomes',
  'signal_blobs', 'signal_subs', 'signal_deliveries',
  'transactive_memory', 'agent_expertise', 'communication_shadow_log',
  // Strategy & NCE
  'cognitive_recipe_performance', 'cognitive_keys', 'cognitive_recipes',
  // Registry & releases
  'registry_artifacts', 'releases', 'release_rollouts',
  'marketplace_listings', 'usage_ledger', 'integrations',
  'ide_integrations', 'prompt_versions', 'datasets', 'dataset_cases',
  'experiments', 'snapshots', 'workspace_snapshots',
  'lineage_nodes', 'lineage_edges',
  'swarm_proposals', 'swarm_votes',
  'trinity_worlds', 'topology_sessions',
  'dialect_contracts', 'dialect_symbols', 'verbal_escalations',
  'verbal_dialogue_turns', 'verbal_closing_artifacts',
  'uplift_runs', 'uplift_pairs', 'uplift_comparisons',
  'philosophy_analyses', 'adaptive_state',
  'homeostasis_states', 'mission_organism_state',
  'agent_permissions',
  'topology_finalizations', 'detached_processes',
]);

test('schema drift: no orphan tables outside schema authority', async () => {
  const db = await getDatabase();
  const rows = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'idx_%'"
  );
  const orphans = rows
    .map((r) => r.name)
    .filter((t) => !CANONICAL_TABLES.has(t));
  if (orphans.length > 0) {
    console.error('[schema-drift] Orphan tables found:', orphans);
    console.error('[schema-drift] Add them to CANONICAL_TABLES in this test or remove them.');
  }
  expect(orphans).toEqual([]);
});

test('schema drift: canonical tables exist', async () => {
  const db = await getDatabase();
  const rows = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  const existing = new Set(rows.map((r) => r.name));
  const missing = [...CANONICAL_TABLES].filter((t) => !existing.has(t));
  if (missing.length > 0) {
    console.error('[schema-drift] Missing canonical tables:', missing);
  }
  expect(missing).toEqual([]);
});
