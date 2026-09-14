'use strict';

/**
 * @file organizationRouting.js
 * @description Message routing for dynamic organizations, extracted from
 * dynamicOrganizationService so it can enforce the role authority of each
 * organization topology (hub, ranked leaders, adversarial pairs).
 */
const { authorityFor } = require('./organizationAlgorithms');

const ROUTING_CHANNELS = Object.freeze({
  orchestrator: 'orchestrator_handoff',
  shared_trail: 'stigmergic_trail',
  capability: 'capability_mesh',
  ranked: 'ranked_handoff',
  adversarial_pair: 'adversarial_pair'
});

function organizationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolveWorkerTarget(routing, recipientAgentId, orchestratorId) {
  if (routing === 'orchestrator') return orchestratorId;
  if (routing === 'ranked') return recipientAgentId || orchestratorId;
  return null;
}

function resolveRoutingTarget(opts) {
  const { routing, isOrchestrator, recipientAgentId, orchestratorId } = opts;
  if (routing === 'shared_trail') return null;
  if (isOrchestrator) return recipientAgentId || null;
  const target = resolveWorkerTarget(routing, recipientAgentId, orchestratorId);
  return target || recipientAgentId || null;
}

function resolveRoutingChannel(routing, topology) {
  return ROUTING_CHANNELS[routing] || topology;
}

function isBufferedMessage(routing, kind, isOrchestrator) {
  if (isOrchestrator || routing !== 'critical_only') return false;
  return kind !== 'critical' && kind !== 'success';
}

function routeMessage({ state, sender, recipientAgentId, kind }) {
  const policy = state.policy;
  const isOrchestrator = sender.id === state.orchestratorId;
  if (isBufferedMessage(policy.routing, kind, isOrchestrator)) {
    return { recipientAgentId: recipientAgentId || null, channel: 'local_buffer', delivery: 'buffered' };
  }
  const targetOpts = { routing: policy.routing, isOrchestrator, recipientAgentId, orchestratorId: state.orchestratorId };
  return {
    recipientAgentId: resolveRoutingTarget(targetOpts),
    channel: resolveRoutingChannel(policy.routing, policy.topology),
    delivery: 'delivered'
  };
}

// A ranked topology (grey wolf) forbids a follower from bypassing the leaders
// and addressing another follower directly.
function assertRoutingAuthority({ organization, policy, sender, recipientAgentId, orchestratorId }) {
  if (!recipientAgentId || !policy || policy.routing !== 'ranked') return;
  if (sender.id === orchestratorId) return;
  if (authorityFor(organization, sender.role) === 'leader') return;
  if (recipientAgentId !== orchestratorId) {
    throw organizationError('ORGANIZATION_AUTHORITY_VIOLATION', 'Ranked organization: a follower may only address the orchestrator.');
  }
}

module.exports = {
  ROUTING_CHANNELS,
  routeMessage,
  resolveRoutingTarget,
  resolveRoutingChannel,
  isBufferedMessage,
  assertRoutingAuthority
};
