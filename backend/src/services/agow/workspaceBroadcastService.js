'use strict';

const { createHash } = require('node:crypto');
const receiverRegistry = require('./workspaceReceiverRegistry');
const receiptService = require('./broadcastReceiptService');

function hashState(value) {
  if (value === undefined) return null;
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function publish(options) {
  const { frame, modules = [] } = options;
  const transport = require('../signalingTransportService');
  const { SIGNAL_TYPES } = require('../biomimeticSignalingBus');
  const transportReceipt = await transport.publishSignal({
    signalType: SIGNAL_TYPES.LIGAND,
    topic: `agow:workspace:${frame.agentId}`,
    senderAgentId: frame.agentId,
    signalData: { semanticType: 'workspace_broadcast', frameId: frame.frameId, cycle: frame.cycle, primaryContent: frame.primaryContent, secondaryContents: frame.secondaryContents },
    recipientAgentIds: options.recipientAgentIds || []
  });
  const deliveries = [];
  for (const receiver of receiverRegistry.list({ modules })) {
    const before = await receiver.handler({ phase: 'inspect', frame });
    const result = await receiver.handler({ phase: 'apply', frame });
    const beforeStateHash = result?.beforeStateHash || hashState(before);
    const afterStateHash = result?.afterStateHash || hashState(result?.state);
    deliveries.push(receiptService.record({
      frameId: frame.frameId, module: receiver.module, consumed: result?.consumed !== false,
      beforeStateHash, afterStateHash, effectType: result?.effectType || null,
      changed: Boolean(result?.changed ?? (beforeStateHash && afterStateHash && beforeStateHash !== afterStateHash)),
      artifactRefs: Array.isArray(result?.artifactRefs) ? result.artifactRefs : []
    }));
  }
  return { published: transportReceipt?.published === true, transportReceipt, deliveries };
}

module.exports = { publish, hashState };
