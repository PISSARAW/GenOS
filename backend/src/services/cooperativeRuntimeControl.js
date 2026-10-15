'use strict';

const { randomUUID, createHash } = require('node:crypto');
const capability = require('./runtimeControlCapability');
const checkpoints = require('./localRuntimeCheckpoint');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const LINEAGE_FIELDS = [
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
];
const ACTIONS = new Set([
  'pause', 'resume', 'cancel', 'resume_checkpoint', 'capture_checkpoint'
]);
const MIN_TIMEOUT_MS = 25;
const MAX_TIMEOUT_MS = 10000;

function outcome(proven, code, detail) {
  return { proven, code, detail };
}

function field(source, camel, snake) {
  return source[camel] || source[snake] || '';
}

function lineage(source = {}) {
  return {
    workerId: field(source, 'workerId', 'worker_id'),
    missionId: field(source, 'missionId', 'mission_id'),
    episodeId: field(source, 'episodeId', 'episode_id'),
    threadId: field(source, 'threadId', 'thread_id'),
    organizationId: field(source, 'organizationId', 'organization_id'),
    projectId: field(source, 'projectId', 'project_id')
  };
}

function completeLineage(value) {
  return LINEAGE_FIELDS.every(field => typeof value[field] === 'string' && value[field]);
}

function exactLineage(left, right) {
  return LINEAGE_FIELDS.every(field => left?.[field] === right?.[field]);
}

function timeoutMs(value) {
  const configured = Number(value ?? process.env.GENOS_OPERATOR_CONTROL_TIMEOUT_MS) || 3000;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, configured));
}

function checkpointMaterial(source) {
  if (!source) return null;
  return {
    checkpointId: source.checkpointId,
    checkpointHash: source.checkpointHash,
    contextHash: source.contextHash,
    context: source.context,
    contextSize: source.contextSize,
    evidenceRefs: Array.isArray(source.evidenceRefs) ? [...source.evidenceRefs] : source.evidenceRefs
  };
}

function exactCheckpoint(left, right) {
  if (!right) return left === undefined || left === null;
  return left?.checkpointId === right.checkpointId
    && left?.checkpointHash === right.checkpointHash
    && left?.contextHash === right.contextHash;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function captureMaterial(value) {
  const keys = ['runtimeStateId', 'contextHash', 'context', 'contextSize'];
  if (!exactKeys(value, keys) || typeof value.runtimeStateId !== 'string'
    || !/^[A-Za-z0-9_-]{1,200}$/.test(value.runtimeStateId)
    || !checkpoints.nativeGenerated(value.context)) return null;
  const json = canonicalJson(value.context);
  if (value.contextHash !== `sha256:${createHash('sha256')
    .update(json).digest('hex')}` || value.contextSize !== Buffer.byteLength(json)
    || value.contextSize > 256 * 1024) return null;
  return { runtimeStateId: value.runtimeStateId, contextHash: value.contextHash,
    context: value.context, contextSize: value.contextSize };
}

function validProof(ack) {
  return ack?.proven === true && ack?.success === true
    && typeof ack.proofCode === 'string'
    && /^[A-Z0-9_:-]{1,128}$/.test(ack.proofCode);
}

function contextBytes(value) {
  try { return Buffer.byteLength(JSON.stringify(value)); }
  catch (_) { return null; }
}

function validEvidence(refs) {
  return Array.isArray(refs) && refs.length <= 64
    && refs.every(ref => typeof ref === 'string' && ref && Buffer.byteLength(ref) <= 1024);
}

function validCheckpointPayload(checkpoint) {
  if (!checkpoint) return false;
  const proof = [checkpoint.checkpointId, checkpoint.checkpointHash, checkpoint.contextHash];
  const exactProof = proof.every(value => typeof value === 'string' && value);
  const boundedContext = Number.isInteger(checkpoint.contextSize)
    && checkpoint.contextSize >= 0 && checkpoint.contextSize <= 256 * 1024
    && contextBytes(checkpoint.context) === checkpoint.contextSize;
  return exactProof && boundedContext && validEvidence(checkpoint.evidenceRefs);
}

function validateInput(input, exact) {
  if (!ACTIONS.has(input.action) || !completeLineage(exact)) {
    return outcome(false, 'RUNTIME_CONTROL_INVALID', 'Control action or lineage is incomplete.');
  }
  if (input.action === 'resume_checkpoint') {
    const checkpoint = checkpointMaterial(input.checkpoint);
    if (!validCheckpointPayload(checkpoint)) {
      return outcome(false, 'RUNTIME_CHECKPOINT_INVALID', 'Checkpoint proof fields are incomplete.');
    }
  }
  return null;
}

function request(input) {
  const exact = lineage(input.lineage);
  const invalid = validateInput(input, exact);
  if (invalid) return Promise.resolve(invalid);
  const child = input.child;
  if (!child || child.connected !== true || typeof child.send !== 'function'
    || typeof child.on !== 'function' || typeof child.removeListener !== 'function') {
    return Promise.resolve(outcome(false, 'RUNTIME_IPC_UNAVAILABLE',
      'Runtime does not expose a connected IPC control channel.'));
  }
  if (!capability.supports(child, input.action, capability.PROTOCOL_VERSION)) {
    return Promise.resolve(outcome(false, 'RUNTIME_CAPABILITY_UNATTESTED',
      'Runtime did not attest the required control protocol and action.'));
  }
  const message = {
    type: 'genos-runtime-control-request', protocolVersion: capability.PROTOCOL_VERSION,
    requestId: randomUUID(), action: input.action, lineage: exact,
    timeoutMs: timeoutMs(input.timeoutMs)
  };
  const checkpoint = checkpointMaterial(input.checkpoint);
  if (checkpoint) message.checkpoint = checkpoint;
  return exchange(child, message);
}

function finish(ctx, result) {
  if (ctx.settled) return;
  ctx.settled = true;
  clearTimeout(ctx.timer);
  ctx.child.removeListener('message', ctx.onMessage);
  ctx.child.removeListener('close', ctx.onUnavailable);
  ctx.child.removeListener('disconnect', ctx.onUnavailable);
  ctx.resolve(result);
}

function unavailable(ctx) {
  finish(ctx, outcome(false, 'RUNTIME_IPC_CLOSED',
    'Runtime IPC closed before a proven acknowledgement.'));
}

function matchingAck(ctx, ack, capture) {
  if (ack.action !== ctx.message.action
    || !exactLineage(ack.lineage, ctx.message.lineage)
    || !exactCheckpoint(ack.checkpoint, ctx.message.checkpoint)
    || !validProof(ack)) return false;
  if (ctx.message.action !== 'capture_checkpoint') return true;
  return Boolean(capture)
    && ack.proofCode === 'RUNTIME_GENERATED_CHECKPOINT_CAPTURED'
    && exactKeys(ack.lineage, LINEAGE_FIELDS)
    && exactKeys(ack, ['type', 'requestId', 'action', 'lineage',
      'proven', 'success', 'proofCode', 'capture']);
}

function acknowledge(ctx, ack) {
  if (ack?.type !== 'genos-runtime-control-ack'
    || ack.requestId !== ctx.message.requestId) return;
  const capture = ctx.message.action === 'capture_checkpoint'
    ? captureMaterial(ack.capture) : null;
  if (!matchingAck(ctx, ack, capture)) {
    finish(ctx, outcome(false, 'RUNTIME_ACK_DIVERGENT',
      'Runtime acknowledgement does not prove the exact request.'));
    return;
  }
  finish(ctx, { ...outcome(true, ack.proofCode,
    'Runtime acknowledged the exact cooperative control request.'),
  requestId: ctx.message.requestId, ...(capture ? { capture } : {}) });
}

function expired(ctx) {
  finish(ctx, outcome(false, 'RUNTIME_ACK_TIMEOUT',
    'Runtime did not acknowledge control before the deadline.'));
}

function sent(ctx, error) {
  if (error) finish(ctx, outcome(false, 'RUNTIME_SEND_FAILED',
    'Runtime control request could not be sent.'));
}

function startExchange(ctx) {
  ctx.onMessage = ack => acknowledge(ctx, ack);
  ctx.onUnavailable = () => unavailable(ctx);
  ctx.timer = setTimeout(() => expired(ctx), ctx.message.timeoutMs);
  ctx.child.on('message', ctx.onMessage);
  ctx.child.once('close', ctx.onUnavailable);
  ctx.child.once('disconnect', ctx.onUnavailable);
  try {
    ctx.child.send(ctx.message, error => sent(ctx, error));
  } catch (_) {
    sent(ctx, new Error('send failed'));
  }
}

function exchange(child, message) {
  return new Promise(resolve => startExchange({ child, message, resolve, settled: false }));
}

module.exports = { request, lineage, exactLineage, timeoutMs };
