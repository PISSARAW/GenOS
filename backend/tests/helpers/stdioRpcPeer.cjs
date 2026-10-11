'use strict';

const { spawn } = require('node:child_process');
const readline = require('node:readline');

function peer(options) {
  const child = spawn(options.command, options.args || [], { cwd: options.cwd, env: options.env,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  const transcript = [];
  const invalidStdout = [];
  const closed = new Promise(resolve => child.once('close', resolve));
  let nextId = 0;
  let stderr = '';
  const lines = readline.createInterface({ input: child.stdout });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1024 * 1024); });
  lines.on('line', line => receive({ line, pending, transcript, invalidStdout }));
  child.on('error', error => failAll(pending, error));
  child.stdin.on('error', error => failAll(pending, error));
  child.on('close', code => failAll(pending, new Error(`stdio child exited ${code}`)));
  function request(method, params = {}) {
    const id = ++nextId;
    const message = { jsonrpc: '2.0', id, method, params };
    transcript.push({ direction: 'request', message });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`stdio timeout: ${method}`)); }, 45000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify(message) + '\n');
    });
  }
  async function close() {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 3000);
    try { await closed; } finally { clearTimeout(timer); lines.close(); }
  }
  return { request, close, transcript, invalidStdout, pid: child.pid, get stderr() { return stderr; } };
}

function receive(context) {
  if (!context.line.trim()) return;
  let message;
  try { message = JSON.parse(context.line); }
  catch (_) { context.invalidStdout.push(context.line); return; }
  if (!message || message.jsonrpc !== '2.0') { context.invalidStdout.push(context.line); return; }
  context.transcript.push({ direction: 'response', message });
  const waiter = context.pending.get(message.id);
  if (!waiter) return;
  context.pending.delete(message.id);
  clearTimeout(waiter.timer);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
}

function failAll(pending, error) {
  for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
  pending.clear();
}

async function initialize(client) {
  return client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'p1-live-stdio-qualification', version: '1' } });
}

module.exports = { peer, initialize };
