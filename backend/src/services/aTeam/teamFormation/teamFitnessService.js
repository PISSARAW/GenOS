'use strict';

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function hasCapability(candidate, capability) {
  const expertise = [...(candidate.capabilities || []), ...(candidate.expertise || [])].map((item) => String(item).toLowerCase());
  return expertise.includes(capability) || candidate.verifiedCapabilities?.[capability] === true;
}

function hasRequiredTools(candidate, requirement) {
  const required = Array.isArray(requirement.requiredTools) ? requirement.requiredTools : [];
  if (!required.length) return 0.5;
  const granted = grantedTools(candidate);
  return includesEveryTool(required, granted) ? 1 : 0;
}

function grantedTools(candidate) {
  return [...(candidate.availableTools || []), ...(candidate.toolLease?.tools || [])].map((item) => String(item).toLowerCase());
}

function includesEveryTool(required, granted) {
  return required.every((tool) => hasTool(granted, tool));
}

function hasTool(granted, tool) {
  return granted.includes(String(tool).toLowerCase());
}

function requiredCapability(requirement) {
  return String(requirement.capability || requirement.name || '').toLowerCase();
}

function expertiseScore(candidate, capability) {
  if (!hasCapability(candidate, capability)) return 0;
  return candidate.verifiedCapabilities?.[capability] === true ? 1 : 0.8;
}

function historyScore(candidate) {
  return clamp(candidate.historicalFitness ?? candidate.history?.successRate ?? 0.5);
}

function candidateFactors(candidate, requirement) {
  const capability = requiredCapability(requirement);
  return {
    expertise: expertiseScore(candidate, capability),
    history: historyScore(candidate),
    tools: hasRequiredTools(candidate, requirement),
    reliability: clamp(candidate.reliability ?? 0.5),
    cognitiveFit: clamp(candidate.cognitiveFit ?? 0.5),
    cost: clamp(candidate.costScore ?? 0.5),
    risk: clamp(candidate.risk ?? 0.5)
  };
}

function weightedFit(factors) {
  return factors.expertise * 0.4 + factors.history * 0.18 + factors.tools * 0.14
    + factors.reliability * 0.15 + factors.cognitiveFit * 0.08
    + (1 - factors.cost) * 0.03 + (1 - factors.risk) * 0.02;
}

function scoreCandidate(candidate, requirement) {
  const factors = candidateFactors(candidate, requirement);
  return { ...factors, fit: Number(weightedFit(factors).toFixed(4)) };
}

module.exports = { scoreCandidate, hasRequiredTools };
