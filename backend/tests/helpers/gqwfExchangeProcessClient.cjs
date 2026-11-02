'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

async function startNode(options) {
  const child = fork(path.join(__dirname, 'gqwfExchangeProcessNode.cjs'), [options.role, options.directory],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const pending = new Map();
  const milestones = new Set();
  let sequence = 0;
  const request = (id, send) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('GQWF Exchange process timeout.')); }, 30000);
    pending.set(id, { resolve, reject, timer }); send();
  });
  const finish = response => {
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id); clearTimeout(entry.timer);
    if (response.error) entry.reject(new Error(response.error)); else entry.resolve(response.value);
  };
  const startup = request('ready', () => {});
  child.on('message', response => {
    if (response.milestone) {
      milestones.add(response.milestone);
      finish({ id: `milestone:${response.milestone}`, value: true }); return;
    }
    finish(response);
  });
  const fail = error => { for (const [id] of pending) finish({ id, error: error.message }); };
  child.on('error', fail);
  child.on('exit', code => fail(new Error(`GQWF Exchange process exited: ${code}`)));
  try { await startup; } catch (error) { await stopChild(child); throw error; }
  return { pid: child.pid,
    request(action, value, principal = 'supervisor') {
      const id = ++sequence; return request(id, () => child.send({ id, action, value, principal }));
    },
    milestone(name) { return milestones.has(name) ? Promise.resolve(true) : request(`milestone:${name}`, () => {}); },
    stop() { return stopChild(child); },
  };
}

module.exports = { startNode };
