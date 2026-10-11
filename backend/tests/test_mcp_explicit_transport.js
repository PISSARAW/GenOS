const assert = require('assert');
const http = require('http');
process.env.GENOS_MCP_LEASE = 'genos_strat_verify';
const mcpExecutor = require('../src/services/mcpExecutor');

async function main() {
  let calledTool = null;
  let remoteResult = { content: [{ type: 'text', text: 'remote' }] };
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const message = JSON.parse(body || '{}');
      if (message.method === 'tools/call') calledTool = message.params.name;
      response.writeHead(message.method === 'notifications/initialized' ? 202 : 200, { 'content-type': 'application/json' });
      if (message.method !== 'notifications/initialized') {
        response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: remoteResult }));
      } else response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previousUrl = process.env.GENOS_MCP_URL;
  try {
    process.env.GENOS_MCP_URL = `http://127.0.0.1:${server.address().port}`;
    const result = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_strat_verify', args: {}, timeoutMs: 15000 });
    assert.strictEqual(result.transport, 'http');
    assert.strictEqual(result.success, true);
    assert.strictEqual(calledTool, 'genos_strat_verify');
    remoteResult = { content: [{ type: 'text', text: JSON.stringify({ success: false, status: 'not_implemented' }) }] };
    const refused = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_strat_verify', args: {}, timeoutMs: 15000 });
    assert.strictEqual(refused.success, false);
    assert.strictEqual(refused.status, 'tool_error');
    remoteResult.content.unshift({ type: 'text', text: 'Transport completed' });
    const mixed = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_strat_verify', args: {}, timeoutMs: 15000 });
    assert.strictEqual(mixed.success, false);
    remoteResult = { structuredContent: { success: false, status: 'not_implemented' } };
    const structured = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_strat_verify', args: {}, timeoutMs: 15000 });
    assert.strictEqual(structured.success, false);
    assert.deepStrictEqual(structured.output, remoteResult.structuredContent);
    remoteResult = { structuredContent: {}, content: [{ type: 'text', text: JSON.stringify({ success: false }) }] };
    const conflicting = await mcpExecutor.executeConfiguredTransport({ toolName: 'genos_strat_verify', args: {}, timeoutMs: 15000 });
    assert.strictEqual(conflicting.success, false);
  } finally {
    if (previousUrl === undefined) delete process.env.GENOS_MCP_URL;
    else process.env.GENOS_MCP_URL = previousUrl;
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('Explicit MCP transport routing checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
