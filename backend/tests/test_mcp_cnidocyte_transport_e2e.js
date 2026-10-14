'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbModule = require('../src/db');

const originalDb = dbModule.getDatabase;
const originalUrl = process.env.GENOS_MCP_URL;
const originalEndpoint = process.env.GENOS_MCP_ENDPOINT;
const originalLease = process.env.GENOS_MCP_LEASE;
const originalDisabled = process.env.GENOS_MCP_DISABLED_TOOLS;
const originalToken = process.env.GENOS_MCP_TOKEN;
const originalCommand = process.env.GENOS_MCP_COMMAND;
const originalArgs = process.env.GENOS_MCP_ARGS;
const originalAuditPath = process.env.GENOS_MCP_CNIDOCYTE_TEST_AUDIT;
const audit = [];
let executor;
let auditDirectory;

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function sendPeerResponse(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function handlePeerLine(line, lease, auditFile) {
  const rpc = JSON.parse(line);
  if (rpc.method === 'initialize') {
    return sendPeerResponse(rpc.id, {
      protocolVersion: '2025-06-18', capabilities: {},
      serverInfo: { name: 'cnidocyte-e2e', version: '1' },
    });
  }
  if (rpc.method !== 'tools/call') return;
  fs.appendFileSync(auditFile, `${rpc.params.name}\n`);
  const accepted = lease === 'genos_snapshot';
  sendPeerResponse(rpc.id, {
    isError: !accepted,
    content: [{ type: 'text', text: accepted ? `accepted lease:${lease}` : 'lease denied' }],
  });
}

function runPeer() {
  const readline = require('node:readline');
  const lease = process.env.GENOS_MCP_LEASE || '';
  const auditFile = process.env.GENOS_MCP_CNIDOCYTE_TEST_AUDIT;
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    handlePeerLine(line, lease, auditFile);
  });
}

async function executeConfiguredRequest(args) {
  return executor.execute({
    organizationId: 'org', projectId: 'project', toolName: 'genos_snapshot', args,
  });
}

async function run() {
  dbModule.getDatabase = async () => ({
    get: async () => null,
    run: async (...entry) => { audit.push(entry); return { changes: 1 }; },
  });
  delete require.cache[require.resolve('../src/services/mcpExecutor')];
  executor = require('../src/services/mcpExecutor');
  auditDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'genos-cnidocyte-'));
  const auditFile = path.join(auditDirectory, 'transport-calls.log');
  await fs.promises.writeFile(auditFile, '');
  process.env.GENOS_MCP_COMMAND = process.execPath;
  process.env.GENOS_MCP_ARGS = `"${__filename}" --mcp-peer`;
  process.env.GENOS_MCP_CNIDOCYTE_TEST_AUDIT = auditFile;
  delete process.env.GENOS_MCP_URL;
  delete process.env.GENOS_MCP_ENDPOINT;
  delete process.env.GENOS_MCP_DISABLED_TOOLS;
  delete process.env.GENOS_MCP_TOKEN;

  process.env.GENOS_MCP_LEASE = 'genos_other';
  const refusedLease = await executeConfiguredRequest({ agent: 'worker', out: 'snapshot.json' });
  assert.equal(refusedLease.success, false, 'local dispatch must refuse a tool outside the configured lease');
  assert.equal(refusedLease.status, 'lease_denied');
  assert.equal(refusedLease.code, 'MCP_TOOL_LEASE_DENIED');
  assert.equal((await fs.promises.readFile(auditFile, 'utf8')).length, 0,
    'lease denial must happen before the configured process transport starts');

  process.env.GENOS_MCP_LEASE = 'genos_snapshot';
  const allowed = await executeConfiguredRequest({ agent: 'worker', out: 'snapshot.json' });
  assert.equal(allowed.success, true, `safe MCP call should pass configured stdio transport: ${JSON.stringify(allowed)}`);
  assert.equal(allowed.transport, 'stdio');
  assert.deepEqual(allowed.output, [{ type: 'text', text: 'accepted lease:genos_snapshot' }]);
  assert.deepEqual((await fs.promises.readFile(auditFile, 'utf8')).trim().split(/\r?\n/),
    ['genos_snapshot']);

  const callsBeforeThreat = (await fs.promises.readFile(auditFile, 'utf8')).trim().split(/\r?\n/).length;
  const refused = await executeConfiguredRequest({ agent: 'worker', out: 'eval(malicious)' });
  assert.equal(refused.success, false);
  assert.equal(refused.status, 'blocked');
  assert.equal(refused.policy.reason, 'CNIDOCYTE_REFLEX_INTERCEPTED');
  assert.ok(refused.latencyMicros > 0);
  const callsAfterThreat = (await fs.promises.readFile(auditFile, 'utf8')).trim().split(/\r?\n/).length;
  assert.equal(callsAfterThreat, callsBeforeThreat, 'Cnidocyte refusal must happen before configured transport');
  assert.ok(audit.some(([, , , action, , decision, reason]) =>
    action === 'WORKFLOW_TOOL_CALL' && decision === 'deny' && reason.includes('eval(')));
  console.log('Configured MCP stdio transport enforces the forwarded lease and Cnidocyte refuses a toxic call before transport.');
}

const completion = process.argv.includes('--mcp-peer') ? Promise.resolve().then(runPeer) : run();
completion.catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (process.argv.includes('--mcp-peer')) return;
  dbModule.getDatabase = originalDb;
  restoreEnvironment('GENOS_MCP_URL', originalUrl);
  restoreEnvironment('GENOS_MCP_ENDPOINT', originalEndpoint);
  restoreEnvironment('GENOS_MCP_LEASE', originalLease);
  restoreEnvironment('GENOS_MCP_DISABLED_TOOLS', originalDisabled);
  restoreEnvironment('GENOS_MCP_TOKEN', originalToken);
  restoreEnvironment('GENOS_MCP_COMMAND', originalCommand);
  restoreEnvironment('GENOS_MCP_ARGS', originalArgs);
  restoreEnvironment('GENOS_MCP_CNIDOCYTE_TEST_AUDIT', originalAuditPath);
  if (auditDirectory) await fs.promises.rm(auditDirectory, { recursive: true, force: true });
});
