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

  process.env.GENOS_AGENT_EXECUTOR = '/tmp/custom-genos-executor';
  assert.strictEqual(adapter.configuredExecutable(), '/tmp/custom-genos-executor');
  console.log('Agent runtime adapter default and override checks passed.');
} finally {
  if (previous === undefined) delete process.env.GENOS_AGENT_EXECUTOR;
  else process.env.GENOS_AGENT_EXECUTOR = previous;
}
