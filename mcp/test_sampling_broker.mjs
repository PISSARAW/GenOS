import assert from 'node:assert/strict';
import http from 'node:http';
import { createSamplingBroker } from './samplingBroker.js';

const calls = [];
const broker = await createSamplingBroker({
  createMessage: async (params) => { calls.push(params); return { content: [{ type: 'text', text: 'ok' }] }; }
}, [{ name: 'genos_worker_inbox', description: 'inbox', inputSchema: { type: 'object' } }]);
const result = await request(broker.url, broker.token, { params: { messages: [], maxTokens: 3 } });
assert.equal(result.content[0].text, 'ok');
assert.equal(calls[0].maxTokens, 3);
assert.equal(calls[0].tools, undefined);
await request(broker.url, broker.token, { params: { messages: [], maxTokens: 3, agentContext: { toolLease: ['genos_worker_inbox'] } } });
assert.equal(calls[1].tools[0].name, 'genos_worker_inbox');
assert.equal(calls[1].agentContext, undefined);
broker.setToolHandler(async (input) => ({ name: input.name, accepted: true }));
const tool = await request(broker.toolUrl, broker.token, { name: 'genos_worker_inbox', arguments: {}, agentContext: { executionMode: 'worker', toolLease: ['genos_worker_inbox'] } });
assert.equal(tool.accepted, true);
await assert.rejects(request(broker.toolUrl, broker.token, { name: 'genos_orchestrate', agentContext: { executionMode: 'worker', toolLease: ['genos_orchestrate'] } }), /cannot orchestrate/);
await assert.rejects(request(broker.toolUrl, broker.token, { name: 'genos_worker_inbox', agentContext: { toolLease: [] } }), /outside/);
await broker.close();
console.log('Sampling broker tests passed.');

function request(url, token, body) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => settleResponse({ raw, resolve, reject }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

function settleResponse({ raw, resolve, reject }) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) reject(new Error(parsed.error));
    else resolve(parsed.result);
  } catch (error) { reject(error); }
}
