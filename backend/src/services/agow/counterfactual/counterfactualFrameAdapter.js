'use strict';

const { createHash } = require('node:crypto');
const guard = require('../counterfactualCandidateGuard');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function frameCandidates(frame, candidates) {
  const ids = [frame.primaryContent, ...frame.secondaryContents].filter(Boolean);
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function branchDefinitions(frame, candidates) {
  const selected = frameCandidates(frame, candidates).slice(0, 2);
  if (!selected.length) return [];
  const attend = selected.map((candidate) => ({ branchId: `attend:${candidate.candidateId}`,
    action: 'attend', targetCandidateId: candidate.candidateId }));
  return [...attend, { branchId: `ignore:${selected[0].candidateId}`,
    action: 'ignore', targetCandidateId: selected[0].candidateId }].slice(0, 3);
}

function cloneCandidate(options) {
  const { candidate, simulationId, simulationAgentId, parentFrameId, now } = options;
  const epistemicOrigin = candidate.epistemicOrigin || {};
  const shadow = {
    ...candidate, candidateId: `${simulationId}:${candidate.candidateId}`, agentId: simulationAgentId,
    epistemicOrigin: { origin: epistemicOrigin.origin || 'unknown', realityMode: 'counterfactual',
      agency: epistemicOrigin.agency || 'unknown', simulationId, parentRealityFrameId: parentFrameId },
    causalParents: [...new Set([...(candidate.causalParents || []), parentFrameId])],
    producedAt: now, expiresAt: now + 60_000
  };
  shadow.stateHash = digest(shadow);
  return shadow;
}

function candidatesForBranch(options) {
  const eligible = options.branch.action === 'attend'
    ? options.candidates.filter((candidate) => candidate.candidateId === options.branch.targetCandidateId)
    : options.candidates.filter((candidate) => candidate.candidateId !== options.branch.targetCandidateId);
  return eligible.map((candidate) => cloneCandidate({ ...options, candidate }));
}

module.exports = { frameCandidates, branchDefinitions, cloneCandidate, candidatesForBranch,
  simulationAgentId: guard.simulationAgentId };
