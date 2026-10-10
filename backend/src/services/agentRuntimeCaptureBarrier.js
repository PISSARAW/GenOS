const crypto = require('crypto');
const { activeProcesses } = require('./agentOrchestrationState');

const pending = new WeakSet();
const TIMEOUT_MS = 30000;

function conflict(message, code) {
  return Object.assign(new Error(message), { code, status: 409 });
}

function active(agent) {
  return Boolean(agent.runtime_pid || activeProcesses.has(agent.id));
}

function supportedChild(agent) {
  const child = activeProcesses.get(agent.id);
  if (!child?.genosCaptureBarrier || !child.connected || child.exitCode !== null || pending.has(child)) {
    throw conflict('This active runtime has no available cooperative snapshot barrier.',
      'ORGANISM_SNAPSHOT_RUNTIME_ACTIVE');
  }
  return child;
}

function waitForPause(child, nonce) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('close', onClose);
    };
    const onClose = () => {
      cleanup();
      reject(conflict('Runtime exited before reaching a snapshot safe point.',
        'ORGANISM_SNAPSHOT_BARRIER_LOST'));
    };
    const onMessage = (message) => {
      if (message?.type !== 'genos-snapshot-paused' || message.nonce !== nonce) return;
      cleanup();
      resolve(message);
    };
    child.on('message', onMessage);
    child.on('close', onClose);
    timer = setTimeout(() => {
      cleanup();
      reject(conflict('Runtime did not reach a snapshot safe point in time.',
        'ORGANISM_SNAPSHOT_BARRIER_TIMEOUT'));
    }, TIMEOUT_MS);
    child.send({ type: 'genos-snapshot-pause', nonce }, (error) => { if (error) onClose(); });
  });
}

function resume(child, nonce) {
  pending.delete(child);
  if (child.connected) child.send({ type: 'genos-snapshot-resume', nonce });
}

function captureHandle(agent, child, acknowledgement) {
  const { nonce, phase } = acknowledgement;
  return {
    phase,
    assertAlive() {
      if (activeProcesses.get(agent.id) !== child || !child.connected || child.exitCode !== null) {
        throw conflict('Runtime exited during snapshot capture.', 'ORGANISM_SNAPSHOT_BARRIER_LOST');
      }
    },
    release() { resume(child, nonce); }
  };
}

async function pause(agent) {
  if (!active(agent)) return null;
  const child = supportedChild(agent);
  pending.add(child);
  const nonce = crypto.randomUUID();
  try {
    const acknowledgement = await waitForPause(child, nonce);
    if (!['prepared', 'generated', 'evaluated'].includes(acknowledgement.phase)) {
      throw conflict('Runtime reported an unsafe snapshot phase.', 'ORGANISM_SNAPSHOT_BARRIER_UNSAFE');
    }
    return captureHandle(agent, child, { nonce, phase: acknowledgement.phase });
  } catch (error) {
    resume(child, nonce);
    throw error;
  }
}

module.exports = { pause };
