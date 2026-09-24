'use strict';

const { discoverCandidates } = require('./candidateDiscoveryService');
const { scoreCandidate, hasRequiredTools } = require('./teamFitnessService');
const { compatibilityWith } = require('./compatibilityService');
const { decisionFor } = require('./staffingDecisionService');

function requirementKey(requirement) {
  return String(requirement.capability || requirement.name || '').toLowerCase();
}

function candidatesFor(requirement, candidates) {
  return discoverCandidates(requirement, candidates)
    .filter((candidate) => hasRequiredTools(candidate, requirement) > 0)
    .map((candidate) => ({ candidate, fit: scoreCandidate(candidate, requirement) }));
}

function marginalScore(entry, requirement, selected) {
  const compatibility = compatibilityWith(entry.candidate, selected.map((item) => item.candidate));
  const weight = Math.max(0, Number(requirement.weight) || 1);
  const score = weight * entry.fit.fit * (0.8 + compatibility * 0.2);
  return { score: Number(score.toFixed(4)), compatibility };
}

function rankOptions(options, requirement, selected) {
  return options.map((entry) => ({ ...entry, ...marginalScore(entry, requirement, selected) }))
    .sort((left, right) => right.score - left.score || String(left.candidate.agentId || left.candidate.id).localeCompare(String(right.candidate.agentId || right.candidate.id)));
}

function weightedCoverage(requirements, gaps) {
  const requiredWeight = requirements.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 1), 0);
  const gapWeight = gaps.reduce((sum, item) => sum + item.weight, 0);
  return requiredWeight ? Number(((requiredWeight - gapWeight) / requiredWeight).toFixed(3)) : null;
}

function markCandidateCapabilities(covered, candidate) {
  (candidate.capabilities || []).forEach((item) => covered.add(String(item).toLowerCase()));
  (candidate.expertise || []).forEach((item) => covered.add(String(item).toLowerCase()));
  Object.entries(candidate.verifiedCapabilities || {}).filter(([, verified]) => verified === true)
    .forEach(([capability]) => covered.add(String(capability).toLowerCase()));
}

function staffRequirement(context, requirement) {
  const capability = requirementKey(requirement);
  if (context.covered.has(capability) || context.selected.length >= context.capacity) return;
  const available = candidatesFor(requirement, context.candidates)
    .filter((entry) => !context.assigned.has(entry.candidate.agentId || entry.candidate.id));
  const winner = rankOptions(available, requirement, context.selected)[0];
  if (!winner) return;
  context.selected.push({ ...winner, capability });
  context.assigned.add(winner.candidate.agentId || winner.candidate.id);
  context.covered.add(capability);
  markCandidateCapabilities(context.covered, winner.candidate);
}

function prepareContext(options) {
  const requestedCapacity = Number(options.capacity);
  return {
    requirements: Array.isArray(options.requirements) ? options.requirements : [],
    candidates: Array.isArray(options.candidates) ? options.candidates : [],
    capacity: Number.isFinite(requestedCapacity) ? Math.max(0, Math.floor(requestedCapacity)) : 3,
    selected: [], assigned: new Set(), covered: new Set()
  };
}

function optimizeTeam(options = {}) {
  const context = prepareContext(options);
  const sorted = [...context.requirements].sort((left, right) => Number(right.weight || 1) - Number(left.weight || 1));
  for (const requirement of sorted) staffRequirement(context, requirement);
  const { requirements, selected, covered } = context;
  const gaps = requirements.filter((item) => !covered.has(requirementKey(item))).map((item) => ({ capability: requirementKey(item), reason: 'NO_STAFFED_CANDIDATE', weight: Number(item.weight) || 1 }));
  const decision = decisionFor(requirements, selected, gaps);
  return { selected, gaps, coverage: weightedCoverage(requirements, gaps), decision };
}

module.exports = { optimizeTeam };
