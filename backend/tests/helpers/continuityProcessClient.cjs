'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

function requestPromise(pending, id, send) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CONTINUITY process timeout.')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    send();
  });
}

function deliver(pending, response) {
  const handler = pending.get(response.id);
  if (!handler) return;
  pending.delete(response.id);
  clearTimeout(handler.timer);
  if (response.error) handler.reject(new Error(response.error));
  else handler.resolve(response.value);
}

async function startNode(options) {
  const child = fork(path.join(__dirname, 'continuityProcessNode.cjs'), [options.role, options.directory],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const pending = new Map();
  const milestones = new Map();
  let sequence = 0;
  const startup = requestPromise(pending, 'ready', () => {});
  child.on('message', async response => {
    if (response.resource) {
      try { child.send({ resourceResponse: { id: response.id, value: await options.broker(response) } }); }
      catch (error) { if (child.connected) child.send({ resourceResponse: { id: response.id, error: error.message } }); }
      return;
    }
    if (response.milestone) {
      milestones.set(response.milestone, true);
      deliver(pending, { id: `milestone:${response.milestone}`, value: true });
      return;
    }
    deliver(pending, response);
  });
  const fail = error => {
    for (const [id] of pending) deliver(pending, { id, error: error.message });
  };
  child.on('error', fail);
  child.on('exit', code => fail(new Error(`CONTINUITY process exited: ${code}`)));
  try { await startup; } catch (error) { child.kill(); throw error; }
  return { pid: child.pid,
    request(action, value, principal = 'controller') {
      const id = ++sequence;
      return requestPromise(pending, id, () => child.send({ id, action, value, principal }));
    },
    milestone(name) {
      if (milestones.has(name)) return Promise.resolve(true);
      return requestPromise(pending, `milestone:${name}`, () => {});
    },
    stop() {
      if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
      return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    },
  };
}

module.exports = { startNode };
