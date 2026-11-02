'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

async function startNode(options) {
  const child = fork(path.join(__dirname, 'allostasisProcessNode.cjs'),
    [options.role, options.directory, options.providerDirectory], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const pending = new Map();
  let sequence = 0;
  let exited = false;
  const request = (id, send) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('ALLOSTASIE process timeout.')); }, 30000);
    pending.set(id, { resolve, reject, timer }); send();
  });
  const finish = response => {
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id); clearTimeout(entry.timer);
    if (response.error) entry.reject(Object.assign(new Error(response.error), { code: response.code }));
    else entry.resolve(response.value);
  };
  const startup = request('ready', () => {});
  child.on('message', async response => {
    if (!response.sourceQuery) { finish(response); return; }
    try {
      if (!options.onSourceQuery) throw new Error('Source query route is not authorized.');
      child.send({ sourceReply: response.sourceQuery, value: await options.onSourceQuery(response.value) });
    } catch (error) {
      child.send({ sourceReply: response.sourceQuery, error: error.message, code: error.code });
    }
  });
  const fail = error => { for (const [id] of pending) finish({ id, error: error.message }); };
  child.on('error', fail); child.on('exit', code => { exited = true; fail(new Error(`ALLOSTASIE process exited: ${code}`)); });
  try { await startup; } catch (error) { await stopChild(child); throw error; }
  return { pid: child.pid,
    request(action, value, principal = 'supervisor') {
      if (exited) return Promise.reject(Object.assign(new Error('ALLOSTASIE process offline.'), { code: 'SOURCE_UNAVAILABLE' }));
      const id = ++sequence; return request(id, () => child.send({ id, action, value, principal }));
    }, stop() { return stopChild(child); },
  };
}

module.exports = { startNode };
