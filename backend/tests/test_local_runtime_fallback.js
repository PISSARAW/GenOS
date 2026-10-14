const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { encodeMission, decodeEvents } = require('../src/services/runtimeProtocol');

const runtime = path.resolve(__dirname, '../bin/local-codex-runtime.cjs');
const child = spawn(process.execPath, [runtime], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    GENOS_DEFAULT_MODEL: 'ollama://definitely-not-installed',
    GENOS_MODEL_FALLBACKS: '',
    GENOS_OLLAMA_ENDPOINT: 'http://127.0.0.1:1/v1/chat/completions'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});
const events = [];
let buffer = Buffer.alloc(0);
child.stdout.on('data', (chunk) => {
  buffer = decodeEvents(Buffer.concat([buffer, chunk]), (event) => events.push(event));
});
child.stderr.resume();
child.on('close', (code) => {
  assert.notEqual(code, 0);
  const blocked = events.find((event) => event.eventType === 'AGENT_HALTED');
  assert(blocked, 'a local worker without a parent model budget scope must be halted');
  assert.match(blocked.detail, /parent model budget scope/i);
  assert(!events.some((event) => event.eventType === 'AGENT_COMPLETED'));
  console.log('Local runtime requires a parent model budget scope.');
});
child.stdin.end(encodeMission({ agentId: 'local-fallback-test', prompt: 'Return a result' }));
