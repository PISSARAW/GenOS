'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/allostasisProtocol/contract');
const actor = agentId => ({ agentId, incarnationId: `${agentId}:1`, trustDomain: 'allostasis-demo' });
const ACTORS = Object.fromEntries(['regulator', 'client-a', 'client-b', 'provider'].map(id => [id, actor(id)]));
const SCOPE = { organizationId: 'allostasis-demo', projectId: 'protected-reserve' };
const MISSION = 'allostasis-mission';
const BUDGET = 'shared-runtime';
const UNIT = 'milliseconds';
const CAPACITY = 10000;
const RESERVE = 2000;
const REQUESTED = CAPACITY - RESERVE;
let sequence = 0;

const authority = role => ({ authorityId: `${role}:local-grant`, generation: 1 });
const poolQuery = () => ({ scope: SCOPE, missionId: MISSION, budgetId: BUDGET, unit: UNIT });
const query = client => ({ ...poolQuery(), conversationId: `${client}:initial` });

function allocationQuery(envelope) {
  return { scope: envelope.scope, missionId: envelope.missionId, conversationId: envelope.conversationId,
    allocationId: envelope.payload.allocation.allocationId, allocationDigest: envelope.payload.allocationDigest };
}

function message(type, payload, options) {
  const sender = options.sender || options.client;
  const audience = sender === 'regulator' ? options.client : 'regulator';
  const id = `demo:${++sequence}:${type}`;
  const current = Date.now();
  return createMessage({ messageId: id, idempotencyKey: id, operationId: `op:${options.client}`,
    missionId: MISSION, conversationId: options.conversationId || `${options.client}:initial`, type,
    sender: ACTORS[sender], audience: ACTORS[audience], scope: SCOPE,
    causalRefs: options.causes || [], generations: { incarnation: 1, organization: 1, workspace: 1 },
    authority: authority(sender), createdAt: new Date(current).toISOString(),
    expiresAt: new Date(current + 300000).toISOString(), payload });
}

function providerKey(input) {
  return `provider:${digest([input.query, input.operationId])}`;
}

module.exports = { ACTORS, SCOPE, MISSION, BUDGET, UNIT, CAPACITY, RESERVE, REQUESTED,
  authority, poolQuery, query, allocationQuery, message, providerKey };
