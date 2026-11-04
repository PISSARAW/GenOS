import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {openProxy} from './proxy.mjs';
import protocol from './protocol.json' with {type: 'json'};

const require = createRequire(import.meta.url);
const prompt = require('../../backend/src/services/workerEvidenceLocalPrompt');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dpb-native-check-'));
let malformed = false;
const requests = [];
const upstream = http.createServer(async (request, response) => {
  if (request.url === '/api/tags') {
    response.end(JSON.stringify({models: [{name: protocol.model, digest: protocol.modelDigest}]})); return;
  }
  let body = ''; for await (const chunk of request) body += chunk;
  requests.push(JSON.parse(body));
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(malformed ? {error: 'fixture-invalid-usage'} :
    {model: protocol.model, message: {role: 'assistant', content: '{}'}, done: true,
      done_reason: 'stop', prompt_eval_count: 1, eval_count: 1}));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const options = {upstream: 'http://127.0.0.1:' + upstream.address().port, seed: 211};

async function call(proxy) {
  return fetch(proxy.endpoint + '/api/chat', {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({model: protocol.model, messages: [{role: 'user', content: 'controlled transport fixture'}],
      stream: true, options: {num_predict: 99999}})});
}

function chain(filename) {
  let head = '0'.repeat(64);
  for (const line of fs.readFileSync(filename, 'utf8').trim().split('\n')) {
    const {hash, ...event} = JSON.parse(line);
    assert.equal(event.previous, head);
    head = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
    assert.equal(hash, head);
  }
  return head;
}

try {
  fs.mkdirSync(directory + '/bounded');
  const proxy = await openProxy({...options, directory: directory + '/bounded'});
  try {
    for (let index = 0; index < protocol.maxCalls; index++) assert.equal((await call(proxy)).status, 200);
    assert.equal((await call(proxy)).status, 429);
    assert.equal(requests.length, protocol.maxCalls);
    assert.equal(requests[0].options.num_predict, protocol.maxOutputTokens);
    assert.equal(requests[1].options.seed, 211 + 104729);
    assert.equal(requests[0].stream, true);
    assert.equal(chain(directory + '/bounded/provider-events.jsonl'), proxy.state.head);
  } finally {await proxy.close();}
  malformed = true; fs.mkdirSync(directory + '/unknown');
  const unknown = await openProxy({...options, directory: directory + '/unknown'});
  try {
    assert.equal((await call(unknown)).status, 200);
    assert.equal(unknown.state.unknown, true);
    assert.equal((await call(unknown)).status, 429);
    assert.equal(unknown.state.knownTokens, 0);
  } finally {await unknown.close();}
  const text = prompt.buildAnalysisPrompt({codeWorker: true, agentName: 'fixture', prompt: 'Fix increment',
    assignment: {allowedPatchPaths: ['increment.cjs']}, allowedCommands: ['node invariants.test.cjs'],
    workspaceContext: 'increment.cjs contains the supplied function'});
  assert.ok(text.includes('Allowed patch paths: ["increment.cjs"]'));
  assert.ok(!text.includes('src/file.ext'));
  assert.ok(text.includes('one or two commands'));
  console.log('DPB native transport: actual HTTP, shared bounds, unknown usage, event chain and concrete paths PASS. No real-model qualification claimed.');
} finally {
  await new Promise(resolve => upstream.close(resolve));
  fs.rmSync(directory, {recursive: true, force: true});
}
