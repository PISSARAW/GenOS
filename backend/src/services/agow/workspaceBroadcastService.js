'use strict';

const { createHash } = require('node:crypto');
const receiverRegistry = require('./workspaceReceiverRegistry');
const receiptService = require('./broadcastReceiptService');
const mediationService = require('./workspaceMediationService');
const candidatePool = require('./candidatePoolService');

function hashState(value) {
  if (value === undefined) return null;
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function changedState(result, beforeStateHash, afterStateHash) {
  if (result.changed !== undefined) return Boolean(result.changed);
  return Boolean(beforeStateHash && afterStateHash && beforeStateHash !== afterStateHash);
}

async function recordMediation(options) {
  const { source, frame, receiver, result, beforeStateHash, afterStateHash, changed } = options;
  if (!source) return;
  await mediationService.record({
    candidate: source, frame, targetModule: receiver.module,
    transformation: result.effectType || 'workspace_receiver', beforeStateHash, afterStateHash,
    downstreamAction: result.downstreamAction || null, outcome: { changed }, db: options.db
  });
}

async function recordDelivery(options) {
  const { receiver, frame, source, before, result } = options;
  const beforeStateHash = result.beforeStateHash || hashState(before);
  const afterStateHash = result.afterStateHash || hashState(result.state);
  const changed = changedState(result, beforeStateHash, afterStateHash);
  const receipt = await receiptService.record({
    agentId: frame.agentId, db: options.db, frameId: frame.frameId, module: receiver.module, consumed: result.consumed !== false,
    beforeStateHash, afterStateHash, effectType: result.effectType || null,
    changed, artifactRefs: Array.isArray(result.artifactRefs) ? result.artifactRefs : []
  });
  await recordMediation({ source, frame, receiver, result, beforeStateHash, afterStateHash, changed, db: options.db });
  return receipt;
}

async function deliverReceiver(options) {
  const { receiver, frame, source, db } = options;
  try {
    const context = { frame, candidate: source, db };
    const before = await receiver.handler({ ...context, phase: 'inspect' });
    const result = await receiver.handler({ ...context, phase: 'apply' });
    return await recordDelivery({ receiver, frame, source, before, result: result || {}, db });
  } catch (_) {
    return receiptService.record({ agentId: frame.agentId, db, frameId: frame.frameId, module: receiver.module, consumed: false, beforeStateHash: null, afterStateHash: null, effectType: 'receiver_error', changed: false, artifactRefs: [] });
  }
}

async function publish(options) {
  const { frame, modules } = options;
  require('./agowDefaultReceiversService').ensureRegistered();
  const transport = require('../signalingTransportService');
  const { SIGNAL_TYPES } = require('../biomimeticSignalingBus');
  const transportReceipt = options.skipTransport
    ? { published: false, skipped: true, reason: 'counterfactual_local_delivery' }
    : await transport.publishSignal({
      signalType: SIGNAL_TYPES.LIGAND,
      topic: `agow:workspace:${frame.agentId}`,
      senderAgentId: frame.agentId,
      signalData: { semanticType: 'workspace_broadcast', frameId: frame.frameId, cycle: frame.cycle, primaryContent: frame.primaryContent, secondaryContents: frame.secondaryContents },
      recipientAgentIds: options.recipientAgentIds || []
    });
  const deliveries = [];
  const candidates = await candidatePool.list({ agentId: frame.agentId, db: options.db });
  const source = candidates.find((candidate) => candidate.candidateId === frame.primaryContent);
  for (const receiver of receiverRegistry.list({ modules })) {
    deliveries.push(await deliverReceiver({ receiver, frame, source, db: options.db }));
  }
  return { published: transportReceipt?.published === true, transportReceipt, deliveries };
}

module.exports = { publish, hashState };
