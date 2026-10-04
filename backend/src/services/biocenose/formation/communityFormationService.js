'use strict';

const biologicalModeService = require('../../biologicalModeService');
const candidateMemberService = require('./candidateMemberService');
const independenceOptimizer = require('./independenceOptimizer');
const diversityGapService = require('./diversityGapService');
const { effectiveCommunitySize } = require('./effectiveCommunitySizeService');
const representativeSampling = require('./representativeSamplingService');

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
  const rawCandidates = input.variant === 'representative_community'
    ? assignOperationalRoles(input.candidates, targetCounts(input.population)) : input.candidates;
  let candidates = candidateMemberService.normalizeCandidates(rawCandidates);
  let representative = null;
  if (input.variant === 'representative_community') {
    if (!candidates.length) throw Object.assign(new Error('Representative Community requires an explicit candidate population.'), {
      code: 'BIOCENOSE_REPRESENTATIVE_POPULATION_REQUIRED'
    });
    const requested = targetCounts(input.population);
    const totalQuota = requested.generator + requested.reviewer + requested.verifier;
    const sample = representativeSampling.quotaSample({ population: candidates, totalQuota, seed: input.mission });
    const reweighted = representativeSampling.reweight({ population: candidates, sample: sample.sample });
    const ess = representativeSampling.effectiveSampleSize({ weights: reweighted.weights });
    const biasComparison = representativeSampling.comparePanels({ population: candidates,
      sample: sample.sample, weights: reweighted.weights });
    const selected = new Set(sample.sample.map((item) => item.memberId));
    const selectedCandidates = candidates.filter((candidate) => selected.has(candidate.memberId))
      .map((candidate) => ({ ...candidate, role: null, communityRole: null }));
    candidates = assignOperationalRoles(selectedCandidates, requested)
      .flatMap((candidate) => candidateMemberService.normalizeCandidates([candidate]));
    representative = { ...sample, ...reweighted, ...ess, biasComparison };
  }
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
  if (representative) {
    const strata = new Map(representative.sample.map((item) => [item.memberId, item.stratum]));
    for (const member of members) {
      member.samplingWeight = representative.weights[member.memberId] || 0;
      member.representativeStratum = strata.get(member.memberId) || null;
    }
  }
  return {
    members,
    metrics: {
      requested,
      selectedCandidateIds: selectedIds,
      fallbackMemberCount: members.length - selectedIds.length - 1,
      diversityGaps: diversityGapService.diversityGaps(members, requested),
      effectiveCommunitySize: effectiveCommunitySize(members), representative
    }
  };
}

function assignOperationalRoles(candidates, requested) {
  const list = Array.isArray(candidates) ? candidates : [];
  const capacity = Object.entries(requested).flatMap(([role, count]) => Array(count).fill(role));
  let nextRole = 0;
  return list.map((candidate) => {
    const existingRole = String(candidate.communityRole || candidate.role || '').toLowerCase();
    if (candidateMemberService.MEMBER_ROLES.includes(existingRole)) return candidate;
    const role = capacity[nextRole % capacity.length];
    nextRole += 1;
    const profile = { ...candidate };
    delete profile.role;
    delete profile.communityRole;
    return { ...profile, communityRole: role };
  });
}

module.exports = { formCommunity, targetCounts, populationMember };
