'use strict';

const { activeProcesses } = require('./agentOrchestrationState');

function result(proven, code, detail) {
  return { proven, code, detail };
}

function exactIdentity(child, target) {
  const identity = child?.genosControlIdentity;
  return identity && identity.workerId === target.worker_id
    && identity.missionId === target.mission_id
    && identity.episodeId === target.episode_id
    && identity.threadId === target.thread_id
    && identity.organizationId === target.organization_id
    && identity.projectId === target.project_id;
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
      resolve(closed);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.once('close', () => done(true));
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
  const closed = waitForClose(child,
    Math.max(250, Number(process.env.GENOS_OPERATOR_CONTROL_TIMEOUT_MS) || 3000));
  const requested = await require('./agentRuntimeAdapter/missionControl')
    .stopMission(target.worker_id, { single: true });
  if (!requested) return result(false, 'RUNTIME_STOP_NOT_REQUESTED',
    'Existing shutdown control did not accept the cancellation.');
  if (!await closed) return result(false, 'RUNTIME_STOP_UNCONFIRMED',
    'Runtime did not emit a close event before the control deadline.');
  return result(true, 'RUNTIME_STOP_CONFIRMED', 'Runtime close was observed after cancellation.');
}

async function apply(request) {
  if (request.action === 'cancel') return cancel(request.target);
  return result(false, 'COOPERATIVE_CONTROL_UNAVAILABLE',
    `Runtime cannot prove '${request.action}' without a cooperative acknowledgement.`);
}

module.exports = { apply };
