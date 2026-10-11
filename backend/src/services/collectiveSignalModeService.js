'use strict';

const { publishSignal } = require('./signalingTransportService');

function validateIdentity(input) {
  if (typeof input.orchestrator_id !== 'string' || !input.orchestrator_id.trim()) {
    throw new Error('orchestrator_id is required for a scoped signal.');
  }
  if (typeof input.problem !== 'string' || !input.problem.trim()) throw new Error('problem is required.');
}

function invalidRecipient(id, sender) {
  return typeof id !== 'string' || !id.trim() || id === sender;
}

function validateTransfer(input) {
  validateIdentity(input);
  const voters = input.voters;
  if (!Array.isArray(voters) || voters.length === 0 || voters.length > 100) {
    throw new Error('voters must contain 1 to 100 recipients.');
  }
  const recipients = voters.map((voter) => voter?.agentId);
  if (recipients.some((id) => invalidRecipient(id, input.orchestrator_id))) {
    throw new Error('Every voter must identify a distinct recipient other than the sender.');
  }
  if (new Set(recipients).size !== recipients.length) throw new Error('Duplicate recipients are not allowed.');
  return recipients;
}

function signalPayload(input) {
  if (input.mode === 'plasmid') {
    if (typeof input.decision !== 'boolean') throw new Error('decision must be a boolean for plasmid transfer.');
    return { decision: input.decision, semanticType: 'binary_decision_transfer' };
  }
  if (input.mode !== 'stigmergic') throw new Error('Unsupported collective signal mode.');
  const positions = input.voters.map((voter) => voter.position);
  if (positions.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1)) {
    throw new Error('Every stigmergic voter position must be a finite number between -1 and 1.');
  }
  const netGradient = Number((positions.reduce((sum, value) => sum + value, 0) / positions.length).toFixed(3));
  return { intensity: Math.abs(netGradient), isRepellent: netGradient < 0,
    netGradient, semanticType: 'collective_decision_gradient' };
}

function publicationEnqueued(publication, recipients, routed) {
  return publication.published === true && publication.llmRequired !== true
    && routed.length === recipients.length && publication.routing?.routingMode === 'distributed';
}

function publicationError(publication, routed) {
  return publication.suppressionReason ||
    `Signal was not enqueued to every recipient within the sender scope (routing=${publication.routing?.routingMode || 'none'}, recipients=${routed.length}, llm=${publication.llmRequired === true}).`;
}

function publicationResult(input) {
  const { publication, recipients, signalData } = input;
  const routed = publication.routing?.recipients?.filter((recipient) => recipient.kind === 'agent') || [];
  const enqueued = publicationEnqueued(publication, recipients, routed);
  return {
    configured: true, success: enqueued,
    status: enqueued ? 'signal_enqueued' : 'signal_not_enqueued',
    mode: input.request.mode, problem: input.request.problem, signalId: publication.signalId,
    recipientCount: enqueued ? routed.length : 0,
    published: publication.published === true,
    routingMode: publication.routing?.routingMode || null,
    llmRequired: publication.llmRequired === true,
    deliveryStatus: enqueued ? 'pending' : null,
    ...(input.request.mode === 'stigmergic' ? { netGradient: signalData.netGradient } : {}),
    error: enqueued ? undefined : publicationError(publication, routed),
    transport: 'zero_text',
  };
}

async function executeCollectiveSignalMode(input) {
  const recipients = validateTransfer(input);
  const signalData = signalPayload(input);
  const publication = await publishSignal({
    signalType: input.mode === 'plasmid' ? 'plasmid' : 'pheromone',
    signalData, topic: `decision/${input.problem}`, senderAgentId: input.orchestrator_id,
    recipientAgentIds: recipients, ttlMs: 60_000, deliveryOnly: true,
  });
  return publicationResult({ request: input, publication, recipients, signalData });
}

module.exports = { executeCollectiveSignalMode };
