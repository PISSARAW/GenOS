'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

async function startNode(directory) {
  const child = fork(path.join(__dirname, 'evidenceProcessNode.cjs'), [directory],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const pending = new Map();
  let sequence = 0;
  let ready;
  const startup = new Promise((resolve, reject) => { ready = { resolve, reject }; });
  child.on('message', response => {
    if (response.ready) { ready.resolve(); return; }
    const handler = pending.get(response.id);
    if (!handler) return;
    pending.delete(response.id);
    clearTimeout(handler.timer);
    if (response.error) handler.reject(new Error(response.error));
    else handler.resolve(response.value);
  });
  child.on('error', error => ready.reject(error));
  child.on('exit', code => {
    const error = new Error(`Evidence process exited: ${code}`);
    ready.reject(error);
    for (const handler of pending.values()) {
      clearTimeout(handler.timer);
      handler.reject(error);
    }
    pending.clear();
  });
  const timer = setTimeout(() => { child.kill(); ready.reject(new Error('Evidence startup timeout.')); }, 15000);
  try { await startup; } finally { clearTimeout(timer); }
  return { pid: child.pid, request(action, value) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Evidence request timeout.')); }, 15000);
      pending.set(id, { resolve, reject, timer: timeout });
      child.send({ id, action, value });
    });
  }, stop() {
    if (child.exitCode !== null) return Promise.resolve();
    return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  } };
}

module.exports = { startNode };
