'use strict';

function candidateCapabilities(candidate) {
  return [...(candidate.capabilities || []), ...(candidate.expertise || [])].map((item) => String(item).toLowerCase());
}

function discoverCandidates(requirement, candidates) {
  const capability = String(requirement.capability || requirement.name || '').toLowerCase();
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    if (!candidate.agentId && !candidate.id) return false;
    const capabilities = candidateCapabilities(candidate);
    return capabilities.includes(capability) || candidate.verifiedCapabilities?.[capability] === true;
  });
}

module.exports = { candidateCapabilities, discoverCandidates };
