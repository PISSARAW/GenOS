'use strict';

const { activeProcesses } = require('./agentOrchestrationState');
const cooperative = require('./cooperativeRuntimeControl');

function result(proven, code, detail) {
  return { proven, code, detail };
}

function exactIdentity(child, target) {
  return cooperative.exactLineage(child?.genosControlIdentity,
    cooperative.lineage(target));
}

function waitForClose(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    let settled = false;
    const done = (closed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('close', onClose);
      resolve(closed);
    };
    const onClose = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.once('close', onClose);
  });
}

async function cancel(target) {
  const child = activeProcesses.get(target.worker_id);
  if (!child) {
    return result(false, 'RUNTIME_UNAVAILABLE', 'No exact live runtime can prove cancellation.');
  }
  if (!exactIdentity(child, target)) {
    return result(false, 'RUNTIME_IDENTITY_UNPROVEN',
      'Live process identity does not match the requested CellThread.');
  }
  const acknowledged = await cooperative.request({ child, action: 'cancel',
    lineage: target });
  if (!acknowledged.proven) return acknowledged;
  const closed = waitForClose(child, cooperative.timeoutMs());
  const requested = await require('./agentRuntimeAdapter/missionControl')
    .stopMission(target.worker_id, { single: true });
  if (!requested) return result(false, 'RUNTIME_STOP_NOT_REQUESTED',
    'Existing shutdown control did not accept the cancellation.');
  if (!await closed) return result(false, 'RUNTIME_STOP_UNCONFIRMED',
    'Runtime did not emit a close event before the control deadline.');
  return result(true, 'RUNTIME_STOP_CONFIRMED', 'Runtime close was observed after cancellation.');
}

async function changeState(action, target) {
  const child = activeProcesses.get(target.worker_id);
  if (!child) return result(false, 'RUNTIME_UNAVAILABLE',
    'No exact live runtime can prove control.');
  if (!exactIdentity(child, target)) return result(false, 'RUNTIME_IDENTITY_UNPROVEN',
    'Live process identity does not match the requested CellThread.');
  return cooperative.request({ child, action, lineage: target });
}

async function apply(request) {
  if (request.action === 'cancel') return cancel(request.target);
  if (request.action === 'pause' || request.action === 'resume') {
    return changeState(request.action, request.target);
  }
  return result(false, 'RUNTIME_CONTROL_INVALID', 'Unsupported runtime control action.');
}

module.exports = { apply };
