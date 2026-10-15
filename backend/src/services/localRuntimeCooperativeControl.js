'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const checkpoints = require('./localRuntimeCheckpoint');
const controlLeases = require('./localRuntimeControlLease');

const ACTIONS = [
  'pause', 'resume', 'cancel', 'resume_checkpoint', 'capture_checkpoint'
];
const PROTOCOL_VERSION = 2;
const LINEAGE_FIELDS = [
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
];
const CONTEXT_KEYS = ['kind', 'phase', 'promptHash', 'version'];
const MAX_REQUESTS = 1024;

const runtime = {
  binding: null,
  pending: { pause: null, cancel: null, resume_checkpoint: null },
  paused: null,
  terminating: false,
  channel: process,
  channelCleanup: null,
  controlLease: null,
  reconnect: { enabled: false, lost: false, expired: null, timer: null, waiting: null },
  seen: new Set(),
  seenOrder: []
};

function lineage(mission = {}) {
  return {
    workerId: mission.workerId || mission.agentId || '',
    missionId: mission.missionId || '',
    episodeId: mission.episodeId || '',
    threadId: mission.threadId || '',
    organizationId: mission.organizationId || '',
    projectId: mission.projectId || ''
  };
}

function complete(value) {
  return LINEAGE_FIELDS.every((field) => typeof value[field] === 'string'
    && value[field].length > 0 && value[field].length <= 512);
}

function exact(left, right) {
  return LINEAGE_FIELDS.every((field) => left[field] === right[field]);
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function requestKeys(message) {
  return message?.action === 'resume_checkpoint'
    ? ['type', 'protocolVersion', 'requestId', 'action', 'lineage', 'timeoutMs', 'checkpoint']
    : ['type', 'protocolVersion', 'requestId', 'action', 'lineage', 'timeoutMs'];
}

function validEnvelope(message) {
  if (!exactKeys(message, requestKeys(message))) return false;
  if (message.type !== 'genos-runtime-control-request'
    || message.protocolVersion !== PROTOCOL_VERSION
    || !ACTIONS.includes(message.action)) return false;
  if (typeof message.requestId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(message.requestId)) return false;
  return Number.isInteger(message.timeoutMs) && message.timeoutMs >= 25
    && message.timeoutMs <= 10000;
}

function validRequest(message) {
  if (!runtime.binding || !validEnvelope(message)) return false;
  return exactKeys(message.lineage, LINEAGE_FIELDS)
    && exact(message.lineage, runtime.binding.lineage);
}

function validPreparedContext(context, state) {
  return exactKeys(context, CONTEXT_KEYS)
    && context.kind === 'genos-local-runtime-control'
    && context.version === 1 && context.phase === 'prepared'
    && context.promptHash === sha256(String(state.framedPrompt || ''));
}

function validCheckpointProof(checkpoint) {
  const hash = /^sha256:[a-f0-9]{64}$/;
  return typeof checkpoint.checkpointId === 'string'
    && checkpoint.checkpointId.length > 0 && checkpoint.checkpointId.length <= 200
    && hash.test(checkpoint.checkpointHash || '')
    && hash.test(checkpoint.contextHash || '');
}

function validCheckpointEvidence(checkpoint) {
  return Array.isArray(checkpoint.evidenceRefs)
    && checkpoint.evidenceRefs.length <= 64
    && checkpoint.evidenceRefs.every((ref) => typeof ref === 'string'
      && ref.length > 0 && Buffer.byteLength(ref) <= 1024);
}

function checkpointIntegrity(checkpoint) {
  const keys = ['checkpointId', 'checkpointHash', 'contextHash', 'context',
    'contextSize', 'evidenceRefs'];
  if (!exactKeys(checkpoint, keys) || !validCheckpointProof(checkpoint)
    || !validCheckpointEvidence(checkpoint)) return false;
  const json = canonicalJson(checkpoint.context);
  return checkpoint.contextHash === sha256(json)
    && checkpoint.contextSize === Buffer.byteLength(json)
    && checkpoint.contextSize <= 256 * 1024;
}

function resumeState(checkpoint, state, safePhase) {
  if (!checkpointIntegrity(checkpoint)) return null;
  if (validPreparedContext(checkpoint.context, state)) {
    return safePhase === 'prepared' ? { phase: 'prepared', reply: null } : null;
  }
  const resumed = checkpoints.cooperativeResume(checkpoint.context, state);
  return resumed && ['prepared', 'generated'].includes(safePhase) ? resumed : null;
}

function send(message) {
  return new Promise((resolve) => {
    const channel = runtime.channel;
    if (!channel?.connected || typeof channel.send !== 'function') return resolve(false);
    try { channel.send(message, (error) => resolve(!error)); }
    catch (_) { resolve(false); }
  });
}

function ack(request, proofCode) {
  const message = {
    type: 'genos-runtime-control-ack', requestId: request.requestId,
    action: request.action, lineage: runtime.binding.lineage,
    proven: true, success: true, proofCode
  };
  if (request.action === 'resume_checkpoint') {
    message.checkpoint = {
      checkpointId: request.checkpoint.checkpointId,
      checkpointHash: request.checkpoint.checkpointHash,
      contextHash: request.checkpoint.contextHash
    };
  }
  if (request.action === 'capture_checkpoint') {
    const saved = runtime.binding.state.nativeCheckpoint;
    const json = canonicalJson(saved.context);
    message.capture = { runtimeStateId: saved.runtimeStateId,
      contextHash: sha256(json), context: saved.context,
      contextSize: Buffer.byteLength(json) };
  }
  return send(message);
}

function releasePaused(error) {
  const paused = runtime.paused;
  runtime.paused = null;
  if (!paused) return;
  if (error) paused.reject(error);
  else paused.resolve();
}

async function resume(request) {
  if (!runtime.paused || runtime.terminating) return;
  if (await ack(request, 'RUNTIME_RESUMED')) releasePaused();
}

async function cancel(request) {
  if (!runtime.paused || runtime.terminating) return;
  runtime.terminating = await ack(request,
    'RUNTIME_CANCEL_ACKNOWLEDGED_AT_SAFE_POINT');
}

async function restore(request) {
  if (!runtime.paused || runtime.terminating) return;
  const resumed = resumeState(request.checkpoint, runtime.binding.state,
    runtime.paused.phase);
  if (!resumed) return;
  runtime.binding.state.resumeCheckpoint = resumed;
  if (await ack(request, 'RUNTIME_CHECKPOINT_APPLIED')) releasePaused();
}

async function capture(request) {
  const saved = runtime.binding?.state?.nativeCheckpoint;
  if (!runtime.paused || runtime.terminating || runtime.paused.phase !== 'generated'
    || !saved || !checkpoints.nativeGenerated(saved.context)) return;
  await ack(request, 'RUNTIME_GENERATED_CHECKPOINT_CAPTURED');
}

function dispatchPaused(message) {
  if (message.action === 'pause') return;
  if (message.action === 'cancel') { void cancel(message); return; }
  if (message.action === 'resume_checkpoint') void restore(message);
}

function dispatch(message) {
  if (message.action === 'resume') { void resume(message); return; }
  if (message.action === 'capture_checkpoint') {
    if (runtime.paused) void capture(message);
    return;
  }
  if (runtime.paused) { dispatchPaused(message); return; }
  if (!runtime.pending[message.action] && !runtime.terminating) {
    runtime.pending[message.action] = message;
  }
}

function remember(requestId) {
  if (runtime.seen.has(requestId)) return false;
  if (runtime.seenOrder.length >= MAX_REQUESTS) {
    runtime.seen.delete(runtime.seenOrder.shift());
  }
  runtime.seen.add(requestId);
  runtime.seenOrder.push(requestId);
  return true;
}

function receive(message) {
  if (!validRequest(message) || !remember(message.requestId)) return;
  dispatch(message);
}

function readyMessage(binding) {
  return { type: 'genos-runtime-control-ready', protocolVersion: PROTOCOL_VERSION,
    lineage: binding.lineage, actions: [...ACTIONS] };
}

function startLease(channel) {
  runtime.controlLease?.stop();
  runtime.controlLease = controlLeases.start(runtime.binding.lineage, { channel });
}

function announce(channel) {
  void send(readyMessage(runtime.binding)).then(sent => {
    if (sent && runtime.channel === channel) startLease(channel);
  });
}

function reconnectError(code) {
  return Object.assign(new Error('Runtime control reconnect grace expired.'), { code });
}

function expireReconnect() {
  const error = reconnectError('RUNTIME_RECONNECT_GRACE_EXPIRED');
  runtime.reconnect.expired = error;
  runtime.reconnect.waiting?.reject(error);
  runtime.reconnect.waiting = null;
  if (runtime.paused) releasePaused(error);
}

function armReconnectGrace(timeoutMs = 30000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) return false;
  runtime.reconnect.enabled = true;
  runtime.reconnect.timeoutMs = timeoutMs;
  return true;
}

function releaseReconnect() {
  clearTimeout(runtime.reconnect.timer);
  runtime.reconnect.timer = null;
  runtime.reconnect.lost = false;
  runtime.reconnect.expired = null;
  runtime.reconnect.waiting?.resolve();
  runtime.reconnect.waiting = null;
}

function waitReconnect() {
  if (runtime.reconnect.expired) return Promise.reject(runtime.reconnect.expired);
  if (!runtime.reconnect.lost) return Promise.resolve();
  if (!runtime.reconnect.waiting) {
    runtime.reconnect.waiting = {};
    runtime.reconnect.waiting.promise = new Promise((resolve, reject) => {
      Object.assign(runtime.reconnect.waiting, { resolve, reject });
    });
  }
  return runtime.reconnect.waiting.promise;
}

function bind(state) {
  if (runtime.binding) return runtime.binding.state === state;
  const exactLineage = lineage(state?.mission);
  if (!state || typeof state.framedPrompt !== 'string' || !state.framedPrompt
    || !complete(exactLineage)) return false;
  runtime.binding = { state, lineage: Object.freeze(exactLineage) };
  announce(runtime.channel);
  return true;
}

function attachChannel(channel) {
  if (!runtime.binding || !channel?.connected || typeof channel.send !== 'function'
    || typeof channel.on !== 'function' || typeof channel.removeListener !== 'function') return false;
  runtime.channelCleanup?.();
  runtime.controlLease?.stop();
  process.removeListener('message', receive);
  process.removeListener('disconnect', disconnect);
  runtime.channel = channel;
  releaseReconnect();
  const lost = () => { if (runtime.channel === channel) disconnect(channel); };
  channel.on('message', receive);
  channel.once('disconnect', lost);
  runtime.channelCleanup = () => {
    channel.removeListener('message', receive);
    channel.removeListener('disconnect', lost);
  };
  announce(channel);
  return true;
}

function waitPaused(phase) {
  return new Promise((resolve, reject) => {
    runtime.paused = { resolve, reject, phase };
  });
}

async function pauseAtSafePoint(request, phase) {
  const waiting = waitPaused(phase);
  if (!await ack(request, 'RUNTIME_PAUSED_AT_SAFE_POINT')) releasePaused();
  await waiting;
}

async function cancelAtSafePoint(request, phase) {
  const waiting = waitPaused(phase);
  if (!await ack(request, 'RUNTIME_CANCEL_ACKNOWLEDGED_AT_SAFE_POINT')) {
    releasePaused();
  } else runtime.terminating = true;
  await waiting;
}

async function restoreAtSafePoint(request, phase) {
  const resumed = resumeState(request.checkpoint, runtime.binding.state, phase);
  if (!resumed) return;
  runtime.binding.state.resumeCheckpoint = resumed;
  const sent = await ack(request, 'RUNTIME_CHECKPOINT_APPLIED');
  if (!sent) throw Object.assign(new Error('Checkpoint proof could not be sent.'),
    { code: 'RUNTIME_CONTROL_DISCONNECTED' });
}

async function safePoint(phase) {
  if (!runtime.binding || runtime.terminating) return;
  await waitReconnect();
  const cancelRequest = runtime.pending.cancel;
  runtime.pending.cancel = null;
  if (cancelRequest) return cancelAtSafePoint(cancelRequest, phase);
  const checkpointRequest = runtime.pending.resume_checkpoint;
  runtime.pending.resume_checkpoint = null;
  if (checkpointRequest) await restoreAtSafePoint(checkpointRequest, phase);
  const pauseRequest = runtime.pending.pause;
  runtime.pending.pause = null;
  if (pauseRequest) await pauseAtSafePoint(pauseRequest, phase);
}

function disconnect(channel = runtime.channel) {
  if (runtime.channel !== channel) return;
  runtime.controlLease?.stop();
  runtime.controlLease = null;
  runtime.channelCleanup?.();
  runtime.channelCleanup = null;
  runtime.channel = null;
  if (runtime.reconnect.enabled) {
    runtime.reconnect.lost = true;
    clearTimeout(runtime.reconnect.timer);
    runtime.reconnect.timer = setTimeout(expireReconnect, runtime.reconnect.timeoutMs);
    runtime.reconnect.timer.unref?.();
    return;
  }
  if (runtime.paused) releasePaused(Object.assign(
    new Error('Runtime control channel disconnected while quiescent.'),
    { code: 'RUNTIME_CONTROL_DISCONNECTED' }));
}

process.on('message', receive);
process.on('disconnect', disconnect);

module.exports = { armReconnectGrace, attachChannel, bind, safePoint };
