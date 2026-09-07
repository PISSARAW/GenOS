const assert = require('assert');
const mcpExecutor = require('../src/services/mcpExecutor');

async function testTimeoutNormalization() {
  assert.strictEqual(mcpExecutor.normalizeMcpTimeout(0), 30000);
  assert.strictEqual(mcpExecutor.normalizeMcpTimeout(-1), 30000);
  assert.strictEqual(mcpExecutor.normalizeMcpTimeout(Number.NaN), 30000);
  assert.strictEqual(mcpExecutor.normalizeMcpTimeout(12.9), 12);
  assert.strictEqual(mcpExecutor.normalizeMcpTimeout(Number.MAX_SAFE_INTEGER), 1800000);
  const environment = mcpExecutor.mcpTransportEnvironment('genos_snapshot', 'C:/repo', 'C:/workspace');
  assert.strictEqual(environment.GENOS_MCP_LEASE, 'genos_snapshot');
}

async function testStdioTimeout() {
  const previousCommand = process.env.GENOS_MCP_COMMAND;
  const previousArgs = process.env.GENOS_MCP_ARGS;
  const previousUrl = process.env.GENOS_MCP_URL;
  const previousEndpoint = process.env.GENOS_MCP_ENDPOINT;
  delete process.env.GENOS_MCP_URL;
  delete process.env.GENOS_MCP_ENDPOINT;
  process.env.GENOS_MCP_COMMAND = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  process.env.GENOS_MCP_ARGS = process.platform === 'win32' ? '/c ping -n 3 127.0.0.1' : '-c "sleep 1"';
  try {
    await assert.rejects(
      mcpExecutor.executeConfiguredTransport({ toolName: 'genos_snapshot', timeoutMs: 30 }),
      /MCP STDIO request timed out after 30ms\./
    );
  } finally {
    if (previousCommand === undefined) delete process.env.GENOS_MCP_COMMAND;
    else process.env.GENOS_MCP_COMMAND = previousCommand;
    if (previousArgs === undefined) delete process.env.GENOS_MCP_ARGS;
    else process.env.GENOS_MCP_ARGS = previousArgs;
    if (previousUrl === undefined) delete process.env.GENOS_MCP_URL;
    else process.env.GENOS_MCP_URL = previousUrl;
    if (previousEndpoint === undefined) delete process.env.GENOS_MCP_ENDPOINT;
    else process.env.GENOS_MCP_ENDPOINT = previousEndpoint;
  }
}

Promise.resolve()
  .then(testTimeoutNormalization)
  .then(testStdioTimeout)
  .then(() => console.log('MCP timeout checks passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });