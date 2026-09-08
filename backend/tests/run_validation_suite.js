const { spawnSync } = require('node:child_process');
const path = require('node:path');

const suites = {
  smoke: [
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
    ['legacy migration', 'test_legacy_migration_ambiguity.js'],
    ['notification migration', 'test_notification_preference_migration.js']
  ],
  recovery: [
    ['worker recovery', 'test_worker_failure_recovery.js'],
    ['causal bisection', 'test_automatic_bisection_recovery.js'],
    ['execution reconnection', 'test_execution_loop_reconnections.js']
  ],
  providers: [
    ['provider registry', 'test_supported_model_providers.js'],
    ['Ollama protocol', 'test_ollama_native_protocol.js'],
    ['OpenAI-compatible configuration', 'test_openai_compatible_configuration.js']
  ],
  concurrency: [
    ['seed concurrency', 'test_seed_concurrency.js']
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
  ...suites.providers,
  ...suites.concurrency
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
