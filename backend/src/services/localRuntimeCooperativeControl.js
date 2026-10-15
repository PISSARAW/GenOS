'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const ACTIONS = ['pause', 'resume', 'cancel', 'resume_checkpoint'];
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
    || message.protocolVersion !== 1 || !ACTIONS.includes(message.action)) return false;
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

function validContext(context, state) {
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

function validCheckpoint(checkpoint, state) {
  const keys = ['checkpointId', 'checkpointHash', 'contextHash', 'context',
    'contextSize', 'evidenceRefs'];
  if (!exactKeys(checkpoint, keys) || !validCheckpointProof(checkpoint)
    || !validContext(checkpoint.context, state)
    || !validCheckpointEvidence(checkpoint)) return false;
  const json = canonicalJson(checkpoint.context);
  return checkpoint.contextHash === sha256(json)
    && checkpoint.contextSize === Buffer.byteLength(json)
    && checkpoint.contextSize <= 256 * 1024;
}

function send(message) {
  return new Promise((resolve) => {
    if (!process.connected || typeof process.send !== 'function') return resolve(false);
    try { process.send(message, (error) => resolve(!error)); }
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
  if (!runtime.paused || runtime.terminating
    || runtime.paused.phase !== 'prepared'
    || !validCheckpoint(request.checkpoint, runtime.binding.state)) return;
  runtime.binding.state.resumeCheckpoint = { phase: 'prepared', reply: null };
  if (await ack(request, 'RUNTIME_CHECKPOINT_APPLIED')) releasePaused();
}

function dispatch(message) {
  if (message.action === 'resume') { void resume(message); return; }
  if (runtime.paused && message.action === 'pause') return;
  if (runtime.paused && message.action === 'cancel') { void cancel(message); return; }
  if (runtime.paused && message.action === 'resume_checkpoint') { void restore(message); return; }
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
  return { type: 'genos-runtime-control-ready', protocolVersion: 1,
    lineage: binding.lineage, actions: [...ACTIONS] };
}

function bind(state) {
  if (runtime.binding) return runtime.binding.state === state;
  const exactLineage = lineage(state?.mission);
  if (!state || typeof state.framedPrompt !== 'string' || !state.framedPrompt
    || !complete(exactLineage)) return false;
  runtime.binding = { state, lineage: Object.freeze(exactLineage) };
  void send(readyMessage(runtime.binding));
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
  if (phase !== 'prepared'
    || !validCheckpoint(request.checkpoint, runtime.binding.state)) return;
  runtime.binding.state.resumeCheckpoint = { phase: 'prepared', reply: null };
  const sent = await ack(request, 'RUNTIME_CHECKPOINT_APPLIED');
  if (!sent) throw Object.assign(new Error('Checkpoint proof could not be sent.'),
    { code: 'RUNTIME_CONTROL_DISCONNECTED' });
}

async function safePoint(phase) {
  if (!runtime.binding || runtime.terminating) return;
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

function disconnect() {
  if (runtime.paused) releasePaused(Object.assign(
    new Error('Runtime control channel disconnected while quiescent.'),
    { code: 'RUNTIME_CONTROL_DISCONNECTED' }));
}

process.on('message', receive);
process.on('disconnect', disconnect);

module.exports = { bind, safePoint };
