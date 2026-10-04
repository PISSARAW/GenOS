'use strict';

const { Components, lineageComponents } = require('./graph');
const { invalid, text, natural, collection, sameScope } = require('./validate');

function stringSet(value) {
  return Array.isArray(value) && value.length <= 128
    && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 512);
}
function validOriginTime(origin, at) {
  return Number.isSafeInteger(origin.observedAt) && origin.observedAt <= at
    && Number.isSafeInteger(origin.validUntil) && at < origin.validUntil;
}
function validOriginIdentity(origin) {
  return typeof origin.receiptId === 'string' && origin.receiptId.length > 0
    && typeof origin.modelFamily === 'string' && origin.modelFamily.length > 0
    && origin.validated === true && origin.blinded === true;
}
function completeOrigin(origin, input) {
  const { request, context } = input;
  if (!sameScope(origin.scope, context.scope) || origin.claimHash !== request.claimHash) return false;
  if (!validOriginIdentity(origin) || !validOriginTime(origin, request.at)) return false;
  return [origin.lineageRoots, origin.evidenceRoots, origin.memoryRoots].every(stringSet)
    && origin.lineageRoots.length > 0 && origin.evidenceRoots.length > 0;
}
function originFor(agentId, input) {
  const candidates = input.context.origins.filter((origin) => origin.agentId === agentId
    && origin.claimHash === input.request.claimHash && sameScope(origin.scope, input.context.scope));
  // Conflicting/repeated provenance needs reconciliation, not optimistic selection.
  if (candidates.length !== 1 || !completeOrigin(candidates[0], input)) return null;
  return candidates[0];
}
function overlaps(a, b) {
  const right = new Set(b);
  return a.some((value) => right.has(value));
}
function originDependency(a, b) {
  if (a.modelFamily === b.modelFamily) return 'SHARED_MODEL_FAMILY';
  for (const key of ['lineageRoots', 'evidenceRoots', 'memoryRoots']) {
    if (overlaps(a[key], b[key])) return `SHARED_${key.toUpperCase()}`;
  }
  return null;
}
function pairStatus(pair, data) {
  const { input, lineage, origins } = data;
  if (pair[0] === pair[1] || lineage.connected(pair[0], pair[1])) return 'KNOWN_LINEAGE_DEPENDENCE';
  const a = origins.get(pair[0]);
  const b = origins.get(pair[1]);
  if (!a || !b) return 'ORIGIN_UNKNOWN';
  return originDependency(a, b) || 'PROVENANCE_SEPARATED';
}
function validateVerification(request) {
  text(request.claimHash, 'claimHash');
  text(request.producerId, 'producerId');
  collection(request.verifierIds, 'verifierIds', 64);
  request.verifierIds.forEach((id) => text(id, 'verifierId'));
  if (new Set(request.verifierIds).size !== request.verifierIds.length) invalid('verifierIds.duplicate');
  natural(request.minGroups, 'minGroups');
  if (request.minGroups < 1 || request.minGroups > 64) invalid('minGroups');
}
function eligibleVerifiers(input, data) {
  const { request, context } = input;
  const excluded = [];
  const eligible = [];
  for (const id of [...request.verifierIds].sort()) {
    const agent = context.agents.find((candidate) => candidate.id === id);
    let reason = 'VERIFIER_INACTIVE_OR_UNKNOWN';
    if (agent?.state === 'active') reason = pairStatus([request.producerId, id], data);
    if (reason === 'PROVENANCE_SEPARATED') eligible.push(id);
    else excluded.push({ agentId: id, reason });
  }
  return { eligible, excluded };
}
function cohorts(ids, data) {
  const groups = new Components(ids);
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) {
      if (pairStatus([ids[a], ids[b]], data) !== 'PROVENANCE_SEPARATED') groups.join(ids[a], ids[b]);
    }
  }
  const result = new Map();
  for (const id of ids) {
    const root = groups.root(id);
    if (!result.has(root)) result.set(root, []);
    result.get(root).push(id);
  }
  return [...result.values()].sort((a, b) => a[0] < b[0] ? -1 : Number(a[0] > b[0]));
}
function verification(input) {
  const { request, context, authorization } = input;
  validateVerification(request);
  const reasons = [];
  if (request.requirement !== 'provenance_separation') reasons.push('STATISTICAL_INDEPENDENCE_NOT_ESTABLISHED');
  if (authorization.evidenceGatePassed !== true) reasons.push('EVIDENCE_GATE_REQUIRED');
  if (!context.agents.some((agent) => agent.id === request.producerId)) {
    return { reasons: [...reasons, 'UNKNOWN_PRODUCER'], plan: { groups: [], excluded: [], groupCount: 0 } };
  }
  const ids = [request.producerId, ...request.verifierIds];
  const origins = new Map(ids.map((id) => [id, originFor(id, input)]));
  const data = { input, origins, lineage: lineageComponents(context, request.at) };
  const selected = eligibleVerifiers(input, data);
  const groups = cohorts(selected.eligible, data);
  if (groups.length < request.minGroups) reasons.push('INSUFFICIENT_PROVENANCE_GROUPS');
  return {
    reasons,
    plan: {
      claimHash: request.claimHash, requirement: request.requirement,
      groups, groupCount: groups.length, excluded: selected.excluded,
      interpretation: 'No known shared provenance in the supplied, validated snapshot; not a statistical independence proof.'
    }
  };
}

module.exports = { verification, originDependency, originFor };
