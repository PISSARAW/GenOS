const { spawnSync } = require('node:child_process');
const path = require('node:path');

const suites = {
  smoke: [
    ['philosophy registry health', 'test_philosophy_registry_health.js'],
    ['indicator receipt validation', 'test_indicator_receipt_service.js'],
    ['indicator evaluation persistence', 'test_indicator_evaluation_persistence.js'],
    ['storage bootstrap migration gate', 'test_storage_bootstrap_backend_gate.js'],
    ['Rhizome merge policy evaluation', 'test_rhizome_merge_policy_evaluation.js'],
    ['topology session persistence and MCP operations', 'test_topology_session_persistence.js'],
    ['mission physics parameter service', 'test_mission_physics_parameter_service.js'],
    ['WorldState conditional model', 'test_world_state_conditional.js'],
    ['morphology learning evidence gate', 'test_morphology_learning_evidence.js'],
    ['replicated causal validation', 'test_replicated_causal_validation_service.js'],
    ['replicated causal runtime integration', 'test_replicated_causal_runtime_integration.js'],
    ['biological semantic response validation', 'test_biological_semantic_validation.js'],
    ['syncytium benchmark metrics', 'test_syncytium_benchmark_metrics.js'],
    ['biological benchmark runner', 'test_biological_benchmark_runner.js'],
    ['Antigravity MCP configuration', 'test_antigravity_mcp_config.js'],
    ['philosophy registry contracts', 'test_philosophy_registry_contracts.js'],
    ['mathematical philosophy registry', 'test_mathematical_philosophy_registry.js'],
    ['mathematical philosophy safety', 'test_mathematical_philosophy_safety.js'],
    ['philosophy falsification', 'test_philosophy_falsification.js'],
    ['typed evidence algebra', 'test_typed_evidence_algebra.js'],
    ['fork identity service', 'test_fork_identity_service.js'],
    ['normative ethics assessment', 'test_normative_ethics_service.js'],
    ['ontology relation registry', 'test_ontology_relation_registry.js'],
    ['philosophy ethics service', 'test_philosophy_ethics_service.js'],
    ['philosophy causality service', 'test_philosophy_causality_service.js'],
    ['controlled causal experiment', 'test_controlled_causal_experiment.js'],
    ['philosophy ontology stances', 'test_philosophy_ontology_stances_service.js'],
    ['philosophy modern services', 'test_modern_philosophy_services.js'],
    ['philosophy mcp integration', 'test_philosophy_mcp_integration.js'],
    ['political philosophy service', 'test_political_philosophy_service.js'],
    ['social cognition service', 'test_social_cognition_service.js'],
    ['topology MCP lease enforcement', 'test_mcp_topology_lease.js'],
    ['property invariants for leases and transitions', 'test_property_invariants.js'],
    ['advanced IAM', 'test_advanced_iam.js'],
    ['mathematical promotion integration', 'test_mathematical_promotion_integration.js'],
    ['procedural organism foundations', 'test_procedural_organism_foundations.js'],
    ['procedural organism 9-12', 'test_procedural_organism_9_12.js'],
    ['procedural organism 13-24', 'test_procedural_organism_13_24.js'],
    ['procedural identity', 'test_procedural_identity.js'],
    ['procedural persistence', 'test_procedural_persistence.js'],
    ['procedural graph semantics', 'test_procedural_graph_semantics.js'],
    ['procedural promotion gate', 'test_procedural_promotion_gate.js'],
    ['procedural runtime E2E', 'test_procedural_runtime_e2e.js'],
    ['procedural primitives', 'test_procedural_primitives.js'],
    ['procedural causal validation', 'test_procedural_causal_validation.js'],
    ['procedural E2E autonome', 'test_procedural_e2e_autonome.js'],
    ['procedural learning cycle', 'test_procedural_learning_cycle.js'],
    ['philosophy falsification', 'test_philosophy_falsification.js'],
    ['typed evidence algebra', 'test_typed_evidence_algebra.js'],
    ['fork identity service', 'test_fork_identity_service.js'],
    ['normative ethics assessment', 'test_normative_ethics_service.js'],
    ['REST smoke', 'test_backend.js'],
    ['QD proxy unavailable contract', 'test_qd_proxy_route.js'],
    ['quality', 'run_quality_suite.js'],
    ['natural search controller', 'search/test_natural_search_controller.js'],
    ['natural search runtime E2E', 'search/test_natural_search_runtime_e2e.js'],
    ['natural search pipeline E2E', 'search/test_natural_search_e2e_pipeline.js'],
    ['natural search full pipeline E2E', 'search/test_natural_search_full_pipeline_e2e.js'],
    ['natural search evolution', 'search/test_search_evolution.js']
  ],
  grpc: [
    ['gRPC integration', 'test_grpc_services.js']
  ],
  mcp: [
    ['MCP catalog', 'test_mcp_catalog_registry.js'],
    ['MCP schema', 'test_mcp_schema_contract.js'],
    ['MCP permissions', 'test_mcp_permission_scope_contract.js'],
    ['MCP HTTP transport', 'test_mcp_http_transport.js'],
    ['MCP explicit transport', 'test_mcp_explicit_transport.js'],
    ['MCP server parity', 'test_mcp_server_parity.js']
  ],
  security: [
    ['public route allowlist', 'test_auth_public_surface.js'],
    ['adversarial master', 'test_security_adversarial_master_runner.js']
  ],
  tenancy: [
    ['tenant isolation', 'test_tenancy.js'],
    ['tenant membership', 'test_tenant_membership_scope.js'],
    ['trace tenant scope', 'test_trace_tenant_scope.js']
  ],
  migration: [
    ['MsgPack migration', 'test_msgpack_migration.js'],
    ['formal result MessagePack contract', 'test_formal_result_contract.js'],
    ['legacy migration', 'test_legacy_migration_ambiguity.js'],
    ['notification migration', 'test_notification_preference_migration.js']
  ],
  recovery: [
    ['worker recovery', 'test_worker_failure_recovery.js'],
    ['causal bisection', 'test_automatic_bisection_recovery.js'],
    ['execution reconnection', 'test_execution_loop_reconnections.js']
  ],
  continuity: [
    ['homeostasis continuation', 'test_homeostasis_continuation.js'],
    ['mission continuity', 'test_mission_continuity.js']
  ],
  providers: [
    ['provider registry', 'test_supported_model_providers.js'],
    ['Ollama protocol', 'test_ollama_native_protocol.js'],
    ['OpenAI-compatible configuration', 'test_openai_compatible_configuration.js']
  ],
  concurrency: [
    ['seed concurrency', 'test_seed_concurrency.js']
  ],
  workers: [
    ['Rust and Node worker kind parity', 'test_worker_kind_registry.js'],
    ['worker kind matrix across eight topologies', 'test_topology_worker_kind_matrix.js'],
    ['worker contract adequacy across roles and methods', 'test_topology_worker_adequacy.js']
  ],
  epistemicScheduler: [
    ['active task fingerprints', 'test_epistemic_scheduler_active_registry.js'],
    ['independent redundancy', 'test_epistemic_scheduler_redundancy.js'],
    ['novelty allocation', 'test_epistemic_scheduler_novelty.js'],
    ['counterexample propagation', 'test_epistemic_scheduler_counterexample.js'],
    ['Pareto budget reallocation', 'test_epistemic_scheduler_budget.js'],
    ['mathematical dependency graph', 'test_epistemic_scheduler_mathematical_graph.js'],
    ['incremental Lean gate', 'test_epistemic_scheduler_lean_gate.js']
  ],
  signalPlane: [
    ['cognitive obligation registry', 'test_cognitive_obligation_registry.js'],
    ['cognitive residual compiler', 'test_cognitive_residual_compiler.js'],
    ['G-CIR Trinity hypothesis generation', 'test_gcir_trinity_hypothesis_generation.js'],
    ['signal receptor service', 'test_signal_receptor_service.js'],
    ['signal event bus', 'test_signal_event_bus.js'],
    ['signal pipeline integration', 'test_signal_pipeline_integration.js'],
    ['signal actionneurs', 'test_signal_actionneurs.js'],
    ['plasticity tensor', 'test_plasticity_tensor.js'],
    ['semantic loop detector', 'test_semantic_loop_detector.js'],
    ['signal plane e2e', 'test_signal_plane_e2e.js'],
    ['durable signal delivery claims', 'test_signal_delivery_claims.js'],
    ['signal metrics', 'test_signal_metrics.js'],
    ['agent output schema', 'test_agent_output_schema.js'],
    ['biomimetic signaling bus', 'test_biomimetic_signaling_bus.js'],
    ['dynamic organization', 'test_dynamic_organization.js'],
    ['worker idle lifecycle', 'test_worker_idle_lifecycle.js']
  ],
  relationalPhysiology: [
    ['relational physiology core', 'relationalPhysiology/core.test.cjs'],
    ['relational physiology communication', 'relationalPhysiology/communication.test.cjs'],
    ['relational physiology delegation and learning', 'relationalPhysiology/delegation-learning.test.cjs'],
    ['relational physiology epistemics', 'relationalPhysiology/epistemics.test.cjs'],
    ['relational physiology runtime', 'relationalPhysiology/runtime.test.cjs'],
    ['relational physiology SQLite routing', 'relationalPhysiology/sqlite-hook.test.cjs']
  ]
};

suites.all = [
  ...suites.smoke,
  ...suites.signalPlane,
  ...suites.relationalPhysiology,
  ...suites.grpc,
  ...suites.mcp,
  ...suites.security,
  ...suites.tenancy,
  ...suites.migration,
  ...suites.recovery,
  ...suites.continuity,
  ...suites.providers,
  ...suites.concurrency,
  ...suites.workers,
  ...suites.epistemicScheduler
];

function runSuite(profile) {
  const selected = suites[profile];
  if (!selected) throw new Error(`Unknown validation profile '${profile}'. Available profiles: ${Object.keys(suites).filter((name) => name !== 'all').join(', ')}, all`);

  const startedAt = Date.now();
  for (const [name, file] of selected) {
    console.log(`\n>>> ${name}: ${file}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
      cwd: __dirname,
      env: { ...process.env, GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || 'test-only' },
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      console.error(`Validation profile '${profile}' failed in ${file}.`);
      return false;
    }
  }
  console.log(`\nValidation profile '${profile}' passed: ${selected.length} suites in ${Date.now() - startedAt}ms.`);
  return true;
}

if (require.main === module) {
  const profile = process.argv[2] || 'all';
  process.exitCode = runSuite(profile) ? 0 : 1;
}

module.exports = { suites, runSuite };
