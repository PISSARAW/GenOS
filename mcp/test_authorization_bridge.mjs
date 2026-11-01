// Autorisation côté pont stdio : le broker de sampling ne peut pas élargir le
// bail du serveur, et un refus n'est jamais transporté comme un succès HTTP.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSamplingBroker } from './samplingBroker.js';
import { createToolCallHandler } from './toolCallHandler.js';

const previousLease = process.env.GENOS_MCP_LEASE;
const previousExpose = process.env.GENOS_MCP_EXPOSE_ALL;
delete process.env.GENOS_MCP_EXPOSE_ALL;
process.env.GENOS_MCP_LEASE = 'genos_worker_inbox';

const calls = [];
const handler = createToolCallHandler({
  runOrchestrator: async (request) => { calls.push(request.action); return JSON.stringify({ status: 'accepted' }); },
  runGenosCli: async () => { calls.push('cli'); return '{}'; },
  executeStrategyTool: async () => { calls.push('strategy'); return null; }
});
const broker = await createSamplingBroker({ createMessage: async () => ({}) }, []);
broker.setToolHandler((input) => handler({ params: input }));

try {
  // 1. A self-declared agent lease cannot exceed the server lease.
  const escalation = await post(broker.toolUrl, broker.token, { name: 'genos_change_organization',
    arguments: { organization: 'specialist_expert_committee' },
    agentContext: { executionMode: 'orchestrator', toolLease: ['genos_change_organization'] } });
  assert.equal(escalation.status, 403, 'a refusal must not travel as HTTP 200');
  assert.match(escalation.body.error, /outside the active GenOS MCP lease/);
  assert.equal(escalation.body.code, 'MCP_TOOL_LEASE_DENIED');
  assert.deepEqual(calls, [], 'a denied tool must never reach its executor');

  // 2. An uncatalogued name is refused instead of falling through to a route.
  const unknown = await handler({ params: { name: 'genos_not_catalogued', arguments: {} } });
  assert.equal(unknown.isError, true);
  assert.equal(unknown._meta.code, 'MCP_TOOL_LEASE_DENIED');
  assert.deepEqual(calls, []);

  // 3. The agent lease still narrows the server lease.
  const narrowed = await post(broker.toolUrl, broker.token, { name: 'genos_worker_inbox',
    arguments: {}, agentContext: { toolLease: [] } });
  assert.equal(narrowed.status, 502);
  assert.match(narrowed.body.error, /outside the agent MCP lease/);
  console.log('MCP bridge authorization cannot be widened and refusals stay observable: PASS');
} finally {
  await broker.close();
  if (previousLease === undefined) delete process.env.GENOS_MCP_LEASE; else process.env.GENOS_MCP_LEASE = previousLease;
  if (previousExpose !== undefined) process.env.GENOS_MCP_EXPOSE_ALL = previousExpose;
}

function post(url, token, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(url), { method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
