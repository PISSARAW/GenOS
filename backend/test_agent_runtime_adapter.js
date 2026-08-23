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
  const environment = adapter.bundledRuntimeEnvironment();
  assert.strictEqual(environment.GENOS_BIN, path.resolve(__dirname, '../target/debug/genos'));
  assert.strictEqual(environment.GENOS_MCP_BIN, path.resolve(__dirname, '../target/debug/genos-mcp'));

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
