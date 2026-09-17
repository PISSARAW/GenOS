import assert from 'node:assert/strict';
import http from 'node:http';
import { createSamplingBroker } from './samplingBroker.js';

const calls = [];
const broker = await createSamplingBroker({
  createMessage: async (params) => { calls.push(params); return { content: [{ type: 'text', text: 'ok' }] }; }
});
const result = await request(broker.url, broker.token, { params: { messages: [], maxTokens: 3 } });
assert.equal(result.content[0].text, 'ok');
assert.equal(calls[0].maxTokens, 3);
await broker.close();
console.log('Sampling broker tests passed.');

function request(url, token, body) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(raw).result); } catch (error) { reject(error); } });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
