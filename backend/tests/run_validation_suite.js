const { spawnSync } = require('node:child_process');
const path = require('node:path');

const suites = {
  smoke: [
    ['philosophical registry health', 'test_philosophy_registry_health.js'],
    ['mathematical philosophy registry', 'test_mathematical_philosophy_registry.js'],
    ['mathematical philosophy safety', 'test_mathematical_philosophy_safety.js'],
    ['advanced IAM', 'test_advanced_iam.js'],
    ['mathematical promotion integration', 'test_mathematical_promotion_integration.js'],
    ['procedural organism foundations', 'test_procedural_organism_foundations.js'],
    ['procedural organism 9-12', 'test_procedural_organism_9_12.js'],
    ['procedural organism 13-24', 'test_procedural_organism_13_24.js'],
    ['procedural graph semantics', 'test_procedural_graph_semantics.js'],
    ['procedural promotion gate', 'test_procedural_promotion_gate.js'],
    ['procedural runtime E2E', 'test_procedural_runtime_e2e.js'],
    ['procedural primitives', 'test_procedural_primitives.js'],
    ['procedural causal validation', 'test_procedural_causal_validation.js'],
    ['procedural E2E autonome', 'test_procedural_e2e_autonome.js'],
    ['REST smoke', 'test_backend.js'],
    ['quality', 'run_quality_suite.js']
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
  epistemicScheduler: [
    ['active task fingerprints', 'test_epistemic_scheduler_active_registry.js'],
    ['independent redundancy', 'test_epistemic_scheduler_redundancy.js'],
    ['novelty allocation', 'test_epistemic_scheduler_novelty.js'],
    ['counterexample propagation', 'test_epistemic_scheduler_counterexample.js'],
    ['Pareto budget reallocation', 'test_epistemic_scheduler_budget.js'],
    ['mathematical dependency graph', 'test_epistemic_scheduler_mathematical_graph.js'],
    ['incremental Lean gate', 'test_epistemic_scheduler_lean_gate.js']
  ]
};

suites.all = [
  ...suites.smoke,
  ...suites.grpc,
  ...suites.mcp,
  ...suites.security,
  ...suites.tenancy,
  ...suites.migration,
  ...suites.recovery,
  ...suites.continuity,
  ...suites.providers,
  ...suites.concurrency,
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
