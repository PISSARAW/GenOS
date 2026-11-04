'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Agent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

function fixture() {
  const timers = new Set();
  const payload = JSON.stringify({ model: 'fixture', message: { content: '{"ok":true}' },
    done: true, done_reason: 'stop', prompt_eval_count: 7, eval_count: 11 });
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks)), phase = body.messages[0].content;
      if (phase === 'body') {
        response.setHeader('Content-Type', 'application/json');
        response.write(payload.slice(0, 20));
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (response.destroyed) return;
        if (phase !== 'body') response.setHeader('Content-Type', 'application/json');
        response.end(phase === 'body' ? payload.slice(20) : payload);
      }, 2000);
      timers.add(timer);
    });
  });
  return { server, timers };
}
async function accepted(endpoint, phase) {
  const result = await require('../src/services/modelProvider').generate({ model: 'ollama://fixture', endpoint,
    prompt: phase, stream: false, timeoutMs: 15000, maxTokens: 128 });
  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.inputTokens, 7);
  assert.equal(result.outputTokens, 11);
  assert.equal(result.tokenUsageMeasured, true);
  assert.equal(result.finishReason, 'stop');
}
async function explicitBounds(endpoint) {
  const provider = require('../src/services/modelProvider');
  const input = { model: 'ollama://fixture', endpoint, prompt: 'headers', stream: false, maxTokens: 128 };
  await assert.rejects(provider.generate({ ...input, timeoutMs: 100 }), /Model timeout after 100ms/);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30);
  try { await assert.rejects(provider.generate({ ...input, timeoutMs: 15000, signal: controller.signal }), /timeout|abort/i); }
  finally { clearTimeout(timer); }
}
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-provider-deadline-'));
  Object.assign(process.env, { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_DB_PATH: path.join(root, 'test.db'), GENOS_STUDIO_ROOT: path.join(root, 'studio') });
  const previous = getGlobalDispatcher(), short = new Agent({ headersTimeout: 20, bodyTimeout: 20 });
  let routed = 0;
  const { server, timers } = fixture();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/chat`;
  setGlobalDispatcher({ dispatch(options, handler) { routed++; return short.dispatch(options, handler); } });
  try {
    await assert.rejects(fetch(endpoint, { method: 'POST', body: JSON.stringify({ messages: [{ content: 'headers' }] }),
      signal: AbortSignal.timeout(15000) }), error => error.cause?.code === 'UND_ERR_HEADERS_TIMEOUT');
    await assert.rejects(fetch(endpoint, { method: 'POST', body: JSON.stringify({ messages: [{ content: 'body' }] }),
      signal: AbortSignal.timeout(15000) }).then(response => response.json()),
    error => error.cause?.code === 'UND_ERR_BODY_TIMEOUT');
    const before = routed;
    await accepted(endpoint, 'headers');
    await accepted(endpoint, 'body');
    assert.equal(routed, before + 2, 'Authorized timeouts must preserve the configured dispatcher and its routing policy.');
    await explicitBounds(endpoint);
  } finally {
    setGlobalDispatcher(previous);
    await short.destroy();
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    const flushed = await require('../src/services/telemetryObserver').flush(30000);
    assert.equal(flushed.flushed, true);
    await require('../src/db').closeDatabase();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('genos-provider-deadline-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Provider HTTP: authorized header/body deadlines, measured complete replies, explicit timeout and cancellation PASS (local fixture, no LLM).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
