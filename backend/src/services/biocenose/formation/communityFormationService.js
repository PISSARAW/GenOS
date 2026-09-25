'use strict';

const biologicalModeService = require('../../biologicalModeService');
const candidateMemberService = require('./candidateMemberService');
const independenceOptimizer = require('./independenceOptimizer');
const diversityGapService = require('./diversityGapService');
const { effectiveCommunitySize } = require('./effectiveCommunitySizeService');

function targetCounts(population) {
  return {
    generator: positiveCount(population?.generators),
    reviewer: positiveCount(population?.reviewers),
    verifier: positiveCount(population?.verifiers)
  };
}

function positiveCount(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1;
}

function roleTemplates(mission) {
  const templates = biologicalModeService.compose('biocenose', mission);
  return { community_facilitator: templates[0], generator: templates[1], reviewer: templates[2], verifier: templates[3] };
}

function populationMember({ template, role, index, candidate }) {
  const profile = candidate || {};
  const memberId = profile.memberId || `${role}:${index + 1}`;
  return {
    ...template,
    ...profile,
    memberId,
    role,
    workerRequirements: role === 'reviewer' ? { requiredCapabilities: ['adversarial_review'] } : undefined,
    memberNumber: index + 1,
    mission: `${template.mission}\nWork independently as ${role}; return evidence, assumptions, and unresolved claims.`
  };
}

function membersForRole(input) {
  const { template, role, requested, candidates, selectedIds } = input;
  const picks = independenceOptimizer.selectCandidates(candidates, role, requested);
  picks.forEach((candidate) => selectedIds.push(candidate.memberId));
  return Array.from({ length: requested }, (_, index) => populationMember({
    template, role, index, candidate: picks[index]
  }));
}

function formCommunity(input) {
  const candidates = candidateMemberService.normalizeCandidates(input.candidates);
  if (!input.population && !candidates.length) {
    return { members: biologicalModeService.compose('biocenose', input.mission), metrics: null };
  }
  const requested = targetCounts(input.population);
  const templates = roleTemplates(input.mission);
  const selectedIds = [];
  const members = [templates.community_facilitator];
  for (const role of Object.keys(requested)) {
    members.push(...membersForRole({
      template: templates[role], role, requested: requested[role], candidates, selectedIds
    }));
  }
  return {
    members,
    metrics: {
      requested,
      selectedCandidateIds: selectedIds,
      fallbackMemberCount: members.length - selectedIds.length - 1,
      diversityGaps: diversityGapService.diversityGaps(members, requested),
      effectiveCommunitySize: effectiveCommunitySize(members)
    }
  };
}

module.exports = { formCommunity, targetCounts, populationMember };
