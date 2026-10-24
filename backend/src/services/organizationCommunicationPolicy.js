'use strict';

const manifestService = require('./communication/communicationManifestService');
const decisionContext = require('./communication/communicationDecisionContext');

function organizationError(reasonCode) {
  const error = new Error(`Organization communication denied: ${reasonCode}.`);
  error.code = 'COMMUNICATION_POLICY_DENIED';
  error.reasonCode = reasonCode;
  return error;
}

function channelFor(state) {
  return state.policy.routing === 'shared_trail' ? 'STIGMERGY' : 'SIGNAL';
}

function scopeFor(route, state) {
  if (state.policy.routing === 'shared_trail') return 'STIGMERGY';
  return route.recipientAgentId ? 'UNICAST' : 'MULTICAST';
}

function intentFor(input) {
  const requiringAction = new Set(['question', 'challenge', 'proposal', 'handoff']);
  const risk = input.kind === 'critical' ? 'critical' : input.kind === 'challenge' ? 'medium' : 'low';
  return { purpose: input.kind, risk, requiresAction: requiringAction.has(input.kind) };
}

function topologyOf(input) {
  return { topologyId: input.state.policy.topology, variantId: input.state.policy.variantId || null,
    version: input.state.version, communicationPolicy: input.state.policy };
}

function envelopePayload(input) {
  return { content: input.signalInfo.content,
    payload: { ...input.payload, communicationPolicy: input.communicationPolicy },
    signalData: typeof input.signalData === 'string' ? { payload: input.signalData } : input.signalData };
}

async function enforceOrganizationCommunication(input) {
  const { db, sender, state, route, organization, kind } = input;
  const manifest = await manifestService.buildManifest({ db, agentId: sender.id });
  const intent = intentFor({ kind });
  const context = decisionContext.buildDecisionContext({ agentId: sender.id, intent, manifest,
    topology: topologyOf({ state }), organization,
    relationships: manifest.relations.filter((relation) => relation.sourceAgentId === route.recipientAgentId
      || relation.targetAgentId === route.recipientAgentId) });
  const decision = { action: channelFor(state), scope: scopeFor(route, state),
    recipients: route.recipientAgentId ? [route.recipientAgentId] : [], reasonCodes: [], meta: {} };
  const topologyGate = decisionContext.applyTopologyConstraints(context, decision, decision.action);
  if (!topologyGate.allowed) throw organizationError(topologyGate.reasonCode);
  const channelGate = manifestService.enforceManifestChannel(manifest, topologyGate.decision);
  if (!channelGate.allowed) throw organizationError('CHANNEL_NOT_ALLOWED');
  return { context, topologyId: context.topology.topologyId, variantId: context.topology.variantId,
    organizationVersion: state.version, channel: channelGate.channel, scope: decision.scope,
    decision: { action: decision.action, recipients: decision.recipients, reasonCodes: decision.reasonCodes } };
}

module.exports = { enforceOrganizationCommunication, envelopePayload };
