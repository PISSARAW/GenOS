const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adapter = require('./src/services/agentRuntimeAdapter');
const previous = process.env.GENOS_AGENT_EXECUTOR;

try {
  delete process.env.GENOS_AGENT_EXECUTOR;
  const defaultExecutable = adapter.configuredExecutable();
  assert.strictEqual(
    defaultExecutable,
    path.resolve(__dirname, 'bin/genos-agent-runtime.cjs')
  );
  assert(fs.existsSync(defaultExecutable), 'bundled GenOS runtime must exist');
  const runtimeSource = fs.readFileSync(defaultExecutable, 'utf8');
  assert(runtimeSource.includes("'genos-codex-'"), 'runtime agents must receive an isolated CODEX_HOME');
  assert(runtimeSource.includes("'--dangerously-bypass-hook-trust'"), 'the control-plane policy hook must be enabled non-interactively');
  assert(runtimeSource.includes('mcp_servers.genos.disabled_tools=["genos_orchestrate"]'), 'runtime agents must not receive the root orchestration tool');
  const adapterSource = fs.readFileSync(path.resolve(__dirname, 'src/services/agentRuntimeAdapter.js'), 'utf8');
  assert(adapterSource.includes("event.action === 'VERIFY'"), 'a completed Codex turn must not be killed after reporting aggregate usage');
  assert(runtimeSource.includes('GENOS_EXECUTION_MODE: executionMode'), 'runtime children must receive their authority mode');
  assert(runtimeSource.includes('GENOS_EXECUTION_MODE=${JSON.stringify(executionMode)}'), 'the leased MCP server must receive the same authority mode');
  const orchestratorBridgeSource = fs.readFileSync(path.resolve(__dirname, 'bin/genos-orchestrate.cjs'), 'utf8');
  assert(orchestratorBridgeSource.includes("GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker'"), 'the root orchestration bridge must reject worker recursion');
  const environment = adapter.bundledRuntimeEnvironment();
  assert.strictEqual(environment.GENOS_BIN, path.resolve(__dirname, '../target/debug/genos'));
  assert.strictEqual(environment.GENOS_MCP_BIN, path.resolve(__dirname, '../target/debug/genos-mcp'));
  assert(!adapter.orchestratorToolLease({ requiredTools: ['genos_snapshot', 'genos_orchestrate'] }).includes('genos_orchestrate'));

  process.env.GENOS_AGENT_EXECUTOR = '/tmp/custom-genos-executor';
  assert.strictEqual(adapter.configuredExecutable(), '/tmp/custom-genos-executor');

  const halted = adapter.runtimeExitOutcome(
    { kind: 'guardrail', reason: 'tokens budget exceeded (45001 > 45000)' },
    null, 'SIGTERM', 'ERROR stale external cache message'
  );
  assert.equal(halted.status, 'blocked');
  assert.equal(halted.eventType, 'AGENT_HALTED');
  assert.equal(halted.payload.terminationReason, 'tokens budget exceeded (45001 > 45000)');
  assert.match(halted.payload.stderr, /stale external cache message/);

  const failed = adapter.runtimeExitOutcome(null, 1, null, 'ERROR actual runtime failure');
  assert.equal(failed.status, 'error');
  assert.equal(failed.eventType, 'AGENT_FAILED');
  assert.equal(adapter.evidenceScore({ evidenceReport: { claims: [{ evidence: ['source', 'calculation'] }], uncertainties: ['inclination'] } }), 19);
  console.log('Agent runtime adapter default and override checks passed.');
} finally {
  if (previous === undefined) delete process.env.GENOS_AGENT_EXECUTOR;
  else process.env.GENOS_AGENT_EXECUTOR = previous;
}
