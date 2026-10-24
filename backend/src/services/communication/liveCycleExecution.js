'use strict';

const crypto = require('node:crypto');
const { createEnvelope } = require('./communicationEnvelopeService');
const { getMode } = require('./communicationPolicyEngine');
const { measureCycleUsage } = require('./communicationCycleUsage');
const { comparisonKey, compareCycles } = require('./communicationCycleComparison');
const { signalIdForKey } = require('./communicationIdempotency');

const LEVELS = Object.freeze(['none', 'transport_ack', 'semantic_ack', 'action_ack',
  'verified_ack', 'human_confirmation']);
const VERBAL = new Set(['MICRO_UTTERANCE', 'DIALOGUE', 'HUMAN']);

function modalityOf(action) {
  if (action === 'SIGNAL') return 'ligand';
  if (action === 'STIGMERGY') return 'pheromone';
  if (VERBAL.has(action)) return 'text';
  return 'structured';
}

function payloadOf(intent) {
  return { semanticRefs: intent.semanticRefs || [], artifactRefs: intent.artifactRefs || [],
    content: intent.payload === undefined ? null : intent.payload };
}

function envelopeOf(input) {
  return createEnvelope({
    messageId: input.messageId, kind: 'signal', senderAgentId: input.intent.senderAgentId,
    recipientAgentIds: input.decision.recipients || [], channel: input.decision.action,
    modality: modalityOf(input.decision.action), semanticRefs: input.intent.semanticRefs || [],
    artifactRefs: input.intent.artifactRefs || [], groundingRequired: input.decision.grounding,
    ttlMs: input.decision.ttlMs, payload: input.payload, scope: input.intent.scope || null
  });
}

async function signalTransport(input) {
  const { publishSignal } = require('../signalingTransportService');
  const { getGroundingStatus } = require('./groundingService');
  const result = await publishSignal({
    signalId: input.envelope.messageId, signalType: 'ligand', signalData: input.payload,
    topic: input.decision.meta?.receptorTopic || 'communication',
    senderAgentId: input.intent.senderAgentId,
    recipientAgentIds: input.decision.recipients, semanticRefs: input.intent.semanticRefs,
    artifactRefs: input.intent.artifactRefs, groundingRequired: input.decision.grounding,
    channel: input.decision.action, ttlMs: input.decision.ttlMs, deliveryOnly: true,
    scope: input.intent.scope || null, idempotencyKey: input.idempotencyKey || null
  });
  const acknowledgements = result.published
    ? await getGroundingStatus({ db: input.db, signalId: result.signalId }) : [];
  return { published: result.published === true, signalId: result.signalId,
    acknowledgements, reason: result.suppressionReason || null };
}

function transportOf(decision, adapter) {
  if (adapter && typeof adapter.deliver === 'function') return adapter;
  if (adapter !== undefined) throw new Error('Live communication requires a deliver adapter.');
  if (decision.action === 'SIGNAL') return { deliver: signalTransport };
  throw new Error(`No live communication transport for '${decision.action}'.`);
}

function normalizeAcknowledgements(receipts, input) {
  if (!Array.isArray(receipts)) throw new Error('Delivery acknowledgements must be an array.');
  const expected = new Set(input.decision.recipients || []);
  const seen = new Set();
  return receipts.map((receipt) => normalizeAcknowledgement(receipt,
    { expected, seen, signalId: input.signalId }));
}

function normalizeAcknowledgement(receipt, context) {
  const recipient = receipt.subscriberAgentId || receipt.recipientAgentId;
  assertRecipient(recipient, context);
  assertAcknowledgement(receipt, context.signalId);
  context.seen.add(recipient);
  return { recipientAgentId: recipient, groundingLevel: receipt.groundingLevel || 'none',
    status: receipt.status || 'unknown', evidenceHash: receipt.evidenceHash || null };
}

function assertRecipient(recipient, context) {
  if (!context.expected.has(recipient) || context.seen.has(recipient)) {
    throw new Error('Delivery acknowledgement has an unexpected or duplicate recipient.');
  }
}

function assertAcknowledgement(receipt, signalId) {
  if (receipt.signalId && receipt.signalId !== signalId) {
    throw new Error('Delivery acknowledgement belongs to another signal.');
  }
  if (!LEVELS.includes(receipt.groundingLevel || 'none')) {
    throw new Error('Delivery acknowledgement has an unknown grounding level.');
  }
  if (!statusCompatible(receipt.status, receipt.groundingLevel || 'none')) {
    throw new Error('Delivery acknowledgement status contradicts its grounding level.');
  }
}

function statusCompatible(status, level) {
  if (level === 'none') return true;
  if (level === 'transport_ack') return ['delivered', 'seen', 'acked'].includes(status);
  if (level === 'semantic_ack') return ['seen', 'acked'].includes(status);
  return status === 'acked';
}

function groundingOf(decision, receipts, published) {
  const required = LEVELS.indexOf(decision.grounding || 'none');
  const recipients = decision.recipients || [];
  if (!published) return { satisfied: false, acknowledged: 0, required: decision.grounding || 'none' };
  if (required === 0) return { satisfied: true, acknowledged: 0, required: 'none' };
  const acked = receipts.filter((receipt) => LEVELS.indexOf(receipt.groundingLevel) >= required).length;
  return { satisfied: recipients.length > 0 && acked === recipients.length,
    acknowledged: acked, required: decision.grounding };
}

function idleOutcome(decision, reason) {
  return { executed: false, simulated: false, published: false, reason,
    deliveryAcknowledgements: [], grounding: { satisfied: false, acknowledged: 0,
      required: decision.grounding || 'none' }, tokensUsed: 0, tokensMeasured: true,
    tokenStatus: 'no_model_call', tokenCoverage: 'complete',
    participantUsage: [], usageReceiptId: null };
}

function messageIdFor(opts) {
  return opts.idempotencyKey ? signalIdForKey(opts.idempotencyKey)
    : `sig_${crypto.randomUUID()}`;
}

async function executeLiveCycle(input) {
  const { decision, intent, opts = {} } = input;
  if (getMode() === 'shadow') return idleOutcome(decision, 'SHADOW_MODE');
  if (decision.action === 'SILENCE') return idleOutcome(decision, 'SILENCE_DECISION');
  const cycleId = opts.cycleId || `comm_cycle_${crypto.randomUUID()}`;
  const messageId = messageIdFor(opts);
  const payload = payloadOf(intent);
  const envelope = envelopeOf({ decision, intent, payload, messageId });
  const transport = transportOf(decision, opts.transport);
  const result = await transport.deliver({ db: input.db, decision, intent, cycleId, envelope,
    payload, idempotencyKey: opts.idempotencyKey || null });
  validateTransportResult(result, messageId);
  const signalId = result.signalId || null;
  const deliveryAcknowledgements = normalizeAcknowledgements(result.acknowledgements || [],
    { decision, signalId });
  const usage = measureCycleUsage({ decision, intent, cycleId, result, opts,
    nativeTransport: !opts.transport });
  const groundingSource = opts.transport ? 'adapter_reported' : 'database_observed';
  const outcome = { executed: result.published, simulated: false, published: result.published,
    cycleId, signalId, reason: result.reason || null, deliveryAcknowledgements,
    grounding: { ...groundingOf(decision, deliveryAcknowledgements, result.published),
      source: groundingSource },
    recipientKnew: null, actionTaken: null,
    comparisonKey: comparisonKey({ decision, intent }), ...usage };
  if (opts.baselineCycle) outcome.comparison = compareCycles(opts.baselineCycle, outcome);
  return outcome;
}

function validateTransportResult(result, messageId) {
  if (!result || typeof result.published !== 'boolean') {
    throw new Error('Live transport must report published as a boolean.');
  }
  if (result.published && result.signalId !== messageId) {
    throw new Error('Live transport returned a signal ID that does not match the envelope.');
  }
  if (!result.published && result.acknowledgements?.length) {
    throw new Error('Unpublished communication cannot have delivery acknowledgements.');
  }
}

module.exports = { executeLiveCycle };
