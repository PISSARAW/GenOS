'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildRequestBody } = require('../src/services/modelProviderRequest');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-sampling-test-'));
  process.env.GENOS_DISABLE_DOTENV = '1';
  process.env.GENOS_DB_PATH = path.join(root, 'test.db');
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.NODE_ENV = 'test';
  const base = { provider: 'ollama', modelName: 'fixture', prompt: 'question', stream: false };
  assert.deepEqual(buildRequestBody({ ...base, nativeOllama: true }).options, undefined);
  assert.throws(() => buildRequestBody({ ...base, contextTokens: 4096 }), /native Ollama/);
  assert.throws(() => buildRequestBody({ ...base, nativeOllama: true, contextTokens: 1 }), /context/);
  assert.throws(() => buildRequestBody({ ...base, temperature: -1 }), /temperature/);
  assert.throws(() => buildRequestBody({ ...base, provider: 'gemini', temperature: 0 }), /unsupported/);
  assert.equal(buildRequestBody({ ...base, temperature: 0 }).temperature, 0);
  let received;
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      received = JSON.parse(Buffer.concat(chunks));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ model: 'fixture', message: { content: '{"ok":true}' },
        done: true, prompt_eval_count: 10, eval_count: 3 }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await require('../src/services/modelProvider').generate({
      model: 'ollama://fixture', endpoint: `http://127.0.0.1:${server.address().port}/api/chat`,
      prompt: 'question', stream: false, seed: 17, maxTokens: 128, temperature: 0, contextTokens: 4096,
    });
    assert.equal(JSON.parse(result.text).ok, true);
    assert.deepEqual(received.options, { temperature: 0, num_ctx: 4096, num_predict: 128, seed: 17 });
    assert.equal(result.inputTokens, 10);
    assert.equal(result.outputTokens, 3);
    assert.equal(result.tokenUsageMeasured, true);
    assert.equal(result.usageReceipt, undefined);
    console.log('Sampling controls reach native Ollama; unsupported controls fail explicitly.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/services/telemetryObserver').flush();
    await require('../src/db').closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
