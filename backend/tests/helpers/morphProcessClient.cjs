'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

async function startNode(options) {
  const child = fork(path.join(__dirname, 'morphProcessNode.cjs'), [options.role, options.directory],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const pending = new Map();
  let sequence = 0;
  const request = (id, send) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MORPH process timeout.')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    send();
  });
  const finish = response => {
    const handler = pending.get(response.id);
    if (!handler) return;
    pending.delete(response.id);
    clearTimeout(handler.timer);
    if (response.error) handler.reject(new Error(response.error));
    else handler.resolve(response.value);
  };
  const startup = request('ready', () => {});
  child.on('message', async response => {
    if (response.rpc) {
      try { child.send({ rpcResponse: { id: response.id, value: await options.route(response) } }); }
      catch (error) { if (child.connected) child.send({ rpcResponse: { id: response.id, error: error.message } }); }
      return;
    }
    finish(response);
  });
  const fail = error => {
    for (const [id] of pending) finish({ id, error: error.message });
  };
  child.on('error', fail);
  child.on('exit', code => fail(new Error(`MORPH process exited: ${code}`)));
  try { await startup; } catch (error) { child.kill(); throw error; }
  return { pid: child.pid,
    request(action, value, principal = 'supervisor') {
      const id = ++sequence;
      return request(id, () => child.send({ id, action, value, principal }));
    },
    stop() {
      if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
      return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    },
  };
}

module.exports = { startNode };
