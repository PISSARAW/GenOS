'use strict';

const { aggregateGroups } = require('../evidenceProtocol/juryGroups');
const v = require('./participantValidation');

function active(state, request) {
  if (!state || state.phase !== 'active') throw new Error('MORPH participant quiesced or uninitialized.');
  if (state.version !== request.version) throw new Error('MORPH stale organization version.');
  if (!state.snapshot.members.some(member => v.same(member, request.actor))) throw new Error('MORPH actor is not a current member.');
}

function read(state, request) {
  if (!state || !state.snapshot.members.some(member => v.same(member, request.reader))) {
    throw new Error('MORPH reader is not a current member.');
  }
  const audience = state.snapshot.audiences.find(item => item.messageId === request.messageId);
  if (!audience || !audience.recipients.some(member => v.same(member, request.reader))) {
    throw new Error('MORPH frozen message audience denied.');
  }
  return v.copy(audience);
}

function declaration(snapshot, agentId) {
  const item = snapshot.provenance.find(entry => entry.agentId === agentId);
  const value = item?.content;
  if (!Array.isArray(value?.origins) || !value.origins.length) return null;
  if (value.origins.some(origin => typeof origin !== 'string' || !origin)) return null;
  if (typeof value.executionId !== 'string' || typeof value.methodId !== 'string') return null;
  return { agentId, executionId: value.executionId, methodId: value.methodId,
    provenanceRoots: value.origins, dependsOn: [] };
}

function dependencies(snapshot, roster) {
  const edges = new Map();
  for (const dependency of snapshot.dependencies) {
    const agents = dependency.content?.agentIds;
    if (!Array.isArray(agents) || agents.some(agent => typeof agent !== 'string')) return false;
    for (const agent of agents) {
      if (!edges.has(agent)) edges.set(agent, new Set());
      agents.forEach(other => edges.get(agent).add(other));
    }
  }
  for (const item of roster) item.dependsOn = reachable(edges, item.agentId);
  return true;
}

function reachable(edges, start) {
  const seen = new Set([start]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    for (const id of edges.get(queue[index]) || []) {
      if (!seen.has(id)) { seen.add(id); queue.push(id); }
    }
  }
  return [...seen];
}

function qualify(state, request) {
  const denied = { allowed: false, independentGroups: 0, statisticalIndependence: 'not_established',
    basis: 'declared_provenance_and_dependencies' };
  if (!state || state.phase !== 'active') return denied;
  const claim = state.snapshot.claims.find(item => item.claimId === request.claimId);
  const declared = claim?.content?.verifierIds;
  if (!Array.isArray(declared) || !v.same([...declared].sort(), [...request.verifierIds].sort())) return denied;
  const members = new Set(state.snapshot.members.map(member => member.agentId));
  if (request.verifierIds.some(id => !members.has(id))) return denied;
  const roster = request.verifierIds.map(id => declaration(state.snapshot, id));
  if (roster.some(item => !item) || !dependencies(state.snapshot, roster)) return denied;
  const reveals = Object.fromEntries(roster.map(item => [item.agentId, { verdict: 'accept' }]));
  const result = aggregateGroups(roster, reveals);
  return { ...denied, allowed: result.supportGroups >= request.minimumIndependentGroups,
    independentGroups: result.supportGroups, methodGroups: result.methodGroups };
}

module.exports = { active, read, qualify };
