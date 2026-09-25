import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const briefPath = process.argv[2];
const brief = briefPath ? JSON.parse(fs.readFileSync(briefPath, 'utf8')) : { mission: 'Écris une courte histoire en français.' };
const pending = new Map();
let sequence = 0;
const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  try {
    const answer = JSON.parse(line);
    const waiter = pending.get(answer.id);
    if (!waiter) return;
    pending.delete(answer.id);
    if (answer.error) waiter.reject(new Error(answer.error));
    else waiter.resolve(answer.result);
  } catch (error) { process.stderr.write(`Invalid host answer: ${error.message}\n`); }
});
const client = new Client({ name: 'genos-caller-relay', version: '1.0.0' }, {
  capabilities: { sampling: { tools: {} } }
});
client.setRequestHandler(CreateMessageRequestSchema, (request) => {
  const id = `turn_${++sequence}`;
  const { tools, ...params } = request.params;
  process.stdout.write(`GENOS_SAMPLING_REQUEST:${JSON.stringify({ id, params, availableTools: (tools || []).map((tool) => tool.name) })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'mcp/index.js')],
  cwd: root,
  stderr: 'pipe',
  env: { ...process.env, GENOS_REPO_ROOT: root, GENOS_MCP_PROVIDER: 'codex-caller',
    GENOS_WORKSPACE_ROOT: briefPath ? path.dirname(path.resolve(briefPath)) : root,
    GENOS_MCP_LEASE: 'genos_orchestrate', GENOS_MCP_TOOL_TIMEOUT_MS: '1200000',
    GENOS_STREAM_TELEMETRY: '1' }
});
transport.stderr?.on('data', (data) => process.stderr.write(data));
try {
  await client.connect(transport);
  const result = await client.callTool({ name: 'genos_orchestrate', arguments: {
    mission: brief.mission, background: false, timeoutMs: 1200000,
    executionBudget: { tokens: 30000, latencyMs: 1200000, events: 100, costUsd: 1 }
  } }, undefined, {
    timeout: 1200000,
    maxTotalTimeout: 1200000,
    resetTimeoutOnProgress: true,
    onprogress: (notification) => {
      process.stdout.write(`GENOS_TELEMETRY:${notification.message || ''}\n`);
    }
  });
  process.stdout.write(`GENOS_MISSION_RESULT:${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`GENOS_MISSION_ERROR:${error.stack || error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.close();
  lines.close();
}
