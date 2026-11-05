'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const mcpRequire = createRequire(path.join(root, 'mcp/package.json'));

async function main() {
  const { Client } = mcpRequire('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = mcpRequire('@modelcontextprotocol/sdk/client/stdio.js');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-typed-terminal-'));
  const bridge = path.join(directory, 'bridge.cjs');
  const envelope = require('../src/services/aTeam/dispatchFailureEnvelope').build({
    status: 'BLOCKED', accepted: false, teamRunId: 'subprocess-team',
    completion: { verdict: 'failed', reasons: ['completion_invariant_failed'] },
    audit: { communications: [{ payload: { apiKey: 'MCP_SECRET_SENTINEL' } }] },
    completionInput: { secret: 'MCP_PRIVATE_INPUT_SENTINEL' } });
  await fs.writeFile(bridge, `process.stderr.write('A-Team refused the completion contract.');\n`
    + `process.stdout.write(${JSON.stringify(JSON.stringify(envelope))});\nprocess.exitCode=2;\n`);
  const transport = new StdioClientTransport({ command: process.execPath, args: [root + '/mcp/index.js'],
    cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_REPO_ROOT: root,
      GENOS_MCP_LEASE: 'genos_orchestrate', GENOS_ORCHESTRATOR_BRIDGE: bridge,
      GENOS_AGENT_ID: '', GENOS_CODEX_AUTO_PROVISION_IDENTITY: '0', GENOS_MCP_TOOL_TIMEOUT_MS: '15000' } });
  const client = new Client({ name: 'typed-terminal-test', version: '1.0.0' }, { capabilities: {} });
  transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'genos_orchestrate', arguments: {
      action: 'dispatch_team', executor: 'local', background: false, timeoutMs: 1000,
      mission: 'Exercise the subprocess failure fixture.' } });
    assert.equal(result.isError, true, 'The child process nonzero exit remains a failed MCP call.');
    assert.deepEqual(JSON.parse(result.content[0].text), envelope);
    assert.doesNotMatch(result.content[0].text, /SENTINEL/);
    console.log('Real MCP stdio preserves a typed refused terminal envelope from a child exiting2: PASS');
  } finally {
    await client.close();
    const tempPrefix = path.resolve(os.tmpdir(), 'genos-typed-terminal-');
    if (!path.resolve(directory).startsWith(tempPrefix)) throw Error('TEST_CLEANUP_PATH_INVALID');
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
