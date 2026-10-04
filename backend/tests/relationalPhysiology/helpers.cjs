'use strict';

const { digest } = require('../../src/services/relationalPhysiology');
const SCOPE = Object.freeze({ organizationId: 'org-test', projectId: 'project-test' });
const NOW = 10000;
const clone = (value) => structuredClone(value);
function agent(id, role = 'worker') { return { id, role, state: 'active' }; }
function relation(type, pair, overrides = {}) {
  const [sourceId, targetId] = pair;
  return {
    id: `${type}:${sourceId}:${targetId}`, sourceId, targetId, type,
    state: 'active', scope: clone(SCOPE), validFrom: 0, validUntil: null, ...overrides
  };
}
function origin(agentId, overrides = {}) {
  return {
    agentId, scope: clone(SCOPE), claimHash: 'claim-1', validated: true, blinded: true,
    observedAt: 1, validUntil: 20000, receiptId: `origin:${agentId}`, modelFamily: `model:${agentId}`,
    lineageRoots: [`root:${agentId}`], evidenceRoots: [`trial:${agentId}`], memoryRoots: [], ...overrides
  };
}
function input(kind = 'action') {
  const context = {
    scope: clone(SCOPE), revision: 1, asOf: 0, validUntil: 20000,
    agents: [agent('A', 'orchestrator'), agent('B'), agent('C'), agent('D')],
    relations: [], origins: [], groundings: []
  };
  const request = {
    kind, operationId: 'op-1', scope: clone(SCOPE), actorId: 'A', at: NOW,
    expectedRevision: 1, action: 'read'
  };
  if (kind === 'communicate') Object.assign(request, {
    receiverId: 'B', refs: [
      { id: 'problem', hash: 'hash-problem', kind: 'problem' },
      { id: 'evidence', hash: 'hash-evidence', kind: 'evidence' },
      { id: 'conclusion', hash: 'hash-conclusion', kind: 'conclusion' }
    ], event: 'information'
  });
  if (kind === 'verify') {
    Object.assign(request, { producerId: 'B', verifierIds: ['C', 'D'], claimHash: 'claim-1', minGroups: 2, requirement: 'provenance_separation' });
    context.origins = ['B', 'C', 'D'].map((id) => origin(id));
  }
  if (kind === 'delegate') Object.assign(request, {
    action: 'delegate', childId: 'B', depth: 1, activeChildren: 0,
    budget: { tokens: 10, milliseconds: 10, microUsd: 10 }
  });
  const authorization = {
    allowed: true, operationId: 'op-1', actorId: 'A', validUntil: 20000,
    actionCeilings: [['read', 'write', 'delegate', 'promote'], ['read', 'write', 'delegate', 'promote']],
    resourceCeilings: [['resource-1'], ['resource-1']],
    recipientIds: ['B', 'C', 'D'], readableRefIds: ['problem', 'evidence', 'conclusion'],
    requiredAck: 'none', evidenceGatePassed: true, guardianRules: [], approvals: [],
    delegation: { maxDepth: 1, maxChildren: 5, remaining: { tokens: 100, milliseconds: 100, microUsd: 100 } }
  };
  return bind({ context, request, authorization });
}
function bind(value) {
  value.authorization.requestHash = digest(value.request);
  return value;
}
module.exports = { SCOPE, NOW, clone, agent, relation, origin, input, bind };
