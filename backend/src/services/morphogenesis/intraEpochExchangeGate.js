'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');

function activeEpoch(orchestratorId) {
  const round = require('../agentOrchestrationState').autonomousRounds.get(orchestratorId);
  if (!round || round.advanced) return null;
  return Number(round.epoch || 0);
}

function exchangeDigest(input) {
  const material = { senderAgentId: input.senderAgentId,
    recipientAgentId: input.recipientAgentId || null, kind: input.kind,
    signalType: input.signalType, signalData: input.signalData, payload: input.payload || {} };
  return crypto.createHash('sha256').update(canonicalJson(material)).digest('hex');
}

function evaluate(input) {
  const epoch = activeEpoch(input.orchestratorId);
  if (epoch === null) return { throttled: false, reason: 'no_active_epoch' };
  const intra = require('./intraEpochAdaptationService');
  if (intra.isEvidenceBearing(input)) {
    return { throttled: false, reason: 'evidence_bearing_never_throttled', epoch };
  }
  const digest = exchangeDigest(input);
  const result = intra.gateExchange({ orchestratorId: input.orchestratorId,
    epoch, kind: input.kind, signalType: input.signalType,
    evidenceRefs: input.evidenceRefs || input.payload?.evidenceRefs
      || input.payload?.evidence_refs,
    receiptId: input.receiptId || input.payload?.receiptId
      || input.payload?.receipt_id, digest });
  return { ...result, epoch, digest };
}

module.exports = { activeEpoch, exchangeDigest, evaluate };
