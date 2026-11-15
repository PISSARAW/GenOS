'use strict';

const { getDatabase } = require('../db');
const cognitiveJobs = require('./signalCognitiveJobsService');
const cognitiveEscalation = require('./cognitiveEscalationService');

async function prepare(signal, routing, dispatchResult) {
  if (!dispatchResult.llmRequired || signal.allowCognitiveEscalation !== true) return null;
  const cognitiveSignal = {
    ...signal, signalId: signal.id, signalType: signal.formatted.signalType,
    recipientAgentIds: [], llmRequired: true, payloadRef: signal.id,
    scope: routing.scope
  };
  const escalationQueued = Boolean(routing.scope)
    && cognitiveEscalation.shouldEscalate(cognitiveSignal);
  if (escalationQueued) {
    await cognitiveJobs.enqueueCognitiveJob(await getDatabase(), cognitiveSignal);
  }
  return {
    signal: cognitiveSignal,
    result: { signalId: signal.id, published: true, coalesced: false,
      coalescedCount: 1, signalType: signal.formatted.signalType, routing,
      llmRequired: true, escalationQueued, cognitiveEscalationAuthorized: true }
  };
}

module.exports = { prepare };
