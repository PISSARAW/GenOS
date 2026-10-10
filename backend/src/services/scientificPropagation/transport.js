'use strict';

const { withTransaction } = require('../../db');
const { routeCollectiveSignal } = require('../collectiveSignalOrganizationRouter');
const { createEnvelope } = require('../communication/communicationEnvelopeService');
const { formatSignalForTransport } = require('../biomimeticSignalingBus');
const { recordPendingDeliveries, routedAgentIds } = require('../signalDeliveryHelpers');
const { validatePayloadSize } = require('../signalValidationUtils');
const { formatReference } = require('../scientificReferences');
const { referenceStatus } = require('./referenceState');

async function agentScope(db, agentId) {
  return db.get(`SELECT a.workspace_id, w.organization_id, w.project_id
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
}

function matchesReferenceScope(agent, ref) {
  return Boolean(agent) && agent.workspace_id === ref.workspaceId &&
    agent.organization_id === ref.organizationId && agent.project_id === ref.projectId;
}

async function assertScopedRoute(db, input) {
  const ref = input.signalData.scientificRef;
  const [sender, recipient] = await Promise.all([
    agentScope(db, input.senderAgentId), agentScope(db, input.recipientAgentIds[0]),
  ]);
  if (!matchesReferenceScope(sender, ref) || !matchesReferenceScope(recipient, ref)) {
    throw new Error('Scientific signal scope mismatch');
  }
  const routing = await routeCollectiveSignal({ db, signalId: input.signalId,
    signalType: 'ligand', signalData: input.signalData,
    orchestratorId: input.senderAgentId, recipientAgentIds: input.recipientAgentIds });
  if (routing.routingMode !== 'distributed' ||
      JSON.stringify(routedAgentIds(routing)) !== JSON.stringify(input.recipientAgentIds)) {
    throw new Error('Scientific signal recipient was not authorized by routing');
  }
}

function signalEnvelope(input) {
  const uri = formatReference(input.signalData.scientificRef);
  return createEnvelope({ messageId: input.signalId, kind: 'signal', channel: 'scientific',
    senderAgentId: input.senderAgentId, recipientAgentIds: input.recipientAgentIds,
    modality: 'ligand', semanticRefs: [uri], artifactRefs: [uri],
    scope: { organizationId: input.signalData.scientificRef.organizationId,
      projectId: input.signalData.scientificRef.projectId,
      workspaceId: input.signalData.scientificRef.workspaceId },
    payload: input.signalData });
}

function transportBlob(input) {
  const payload = { ...input.signalData, communicationEnvelope: signalEnvelope(input) };
  const formatted = formatSignalForTransport({ signalType: 'ligand', signalData: payload });
  const size = validatePayloadSize(payload, formatted.signalBlob);
  if (!size.valid) throw new Error(size.reason);
  return formatted.signalBlob;
}

function validateInput(input) {
  if (!validIdentity(input) || !validPayload(input)) {
    throw new Error('Invalid scientific transport input');
  }
  formatReference(input.signalData.scientificRef);
}

function validIdentity(input) {
  return Boolean(input) && input.signalType === 'ligand' &&
    /^sig_scientific_[a-f0-9]{64}$/.test(input.signalId || '') &&
    typeof input.senderAgentId === 'string' && Boolean(input.senderAgentId.trim()) &&
    Array.isArray(input.recipientAgentIds) && input.recipientAgentIds.length === 1 &&
    typeof input.recipientAgentIds[0] === 'string' && Boolean(input.recipientAgentIds[0].trim());
}

function validPayload(input) {
  return Boolean(input?.signalData) && typeof input.signalData === 'object' &&
    !Array.isArray(input.signalData) &&
    input.signalData.outboxEventId === input.signalId.slice('sig_scientific_'.length) &&
    input.signalData.senderAgentId === input.senderAgentId;
}

async function publishScientificSignal(db, input) {
  validateInput(input);
  await assertScopedRoute(db, input);
  const blob = transportBlob(input);
  await withTransaction(db, async (tx) => {
    if (input.signalData.eventType === 'publish' &&
        await referenceStatus(tx, input.signalData.scientificRef) !== 'verified') {
      throw new Error('Scientific publish was superseded before durable delivery');
    }
    await tx.run(`INSERT INTO signal_blobs
      (signal_id, signal_type, signal_blob, content, topic, sender_agent_id, expires_at)
      VALUES (?, 'ligand', ?, '', ?, ?, NULL)`,
    input.signalId, blob, input.topic, input.senderAgentId);
    await recordPendingDeliveries(tx, input.signalId, input.recipientAgentIds);
  });
  return { signalId: input.signalId, published: true, llmRequired: false,
    routing: { routed: true, recipients: input.recipientAgentIds } };
}

module.exports = { publishScientificSignal };
