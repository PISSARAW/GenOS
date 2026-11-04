'use strict';

const dispatches = new Map();

function track(workerId, execute) {
  if (dispatches.has(workerId)) return Promise.resolve(false);
  const pending = Promise.resolve().then(execute);
  dispatches.set(workerId, pending);
  const clear = () => { if (dispatches.get(workerId) === pending) dispatches.delete(workerId); };
  pending.then(clear, clear);
  return pending;
}

async function wait(workerIds, timeoutMs = 30000) {
  const pending = [...workerIds].map(id => dispatches.get(id)).filter(Boolean);
  await settle(pending, timeoutMs);
}

async function settle(pending, timeoutMs = 30000) {
  let timer;
  try {
    await Promise.race([Promise.allSettled(pending), new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Recovery dispatches did not stop before shutdown.'),
        { code: 'WORKER_RECOVERY_SHUTDOWN_TIMEOUT' })), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

module.exports = { track, wait, settle };
