'use strict';

const communityStore = require('../communityStore');
const { validateMember } = require('../contracts/memberContract');
const { normalizeCandidates } = require('./candidateMemberService');
const { selectCandidates } = require('./independenceOptimizer');
const { diversityGaps } = require('./diversityGapService');
const recruitmentStore = require('./adaptiveRecruitmentStore');

async function recruit(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session || session.status !== 'ACTIVE' || !allowedPhase(session.phase)) {
    throw Object.assign(new Error('Adaptive recruitment requires an active formation/review phase.'), { code: 'BIOCENOSE_RECRUITMENT_PHASE_INVALID' });
  }
  const current = normalizeMembers(session.members);
  const targets = { generator: 2, reviewer: 1, verifier: 1, ...(input.roleTargets || {}) };
  const gaps = diversityGaps(current, targets);
  const existingIds = new Set(session.members.map((member) => member.memberId));
  const candidates = normalizeCandidates(input.candidates).filter((candidate) => !existingIds.has(candidate.memberId));
  const selected = selectForGaps({ candidates, roles: gaps.missingRoles, current, input });
  const recruited = [];
  for (const candidate of selected) recruited.push(await persist(input, candidate));
  return { recruited, gapsBeforeRecruitment: gaps, unresolvedRoles: remainingRoles(gaps.missingRoles, recruited) };
}

function normalizeMembers(members) {
  return (members || []).map((member) => ({
    ...member, role: normalizeRole(member.role),
    provider: member.provider || member.modelProvider || null
  })).filter((member) => member.role && (!member.status || member.status === 'ACTIVE'));
}

function normalizeRole(role) {
  const map = { independent_solver: 'generator', adversarial_reviewer: 'reviewer' };
  return map[role] || role;
}

function selectForGaps(context) {
  const selected = context.roles.flatMap((role) => {
    const currentCount = context.current.filter((member) => member.role === role).length;
    const target = Number(context.input.roleTargets?.[role] ?? ({ generator: 2, reviewer: 1, verifier: 1 })[role]);
    return selectCandidates(context.candidates, role, Math.max(0, target - currentCount));
  });
  const providerDeficit = Math.max(0, Number(context.input.minimumProviders || 0) - currentProviderCount([...context.current, ...selected]));
  if (!providerDeficit) return selected;
  const seen = new Set([...context.current, ...selected].map((member) => member.memberId));
  const missingProviders = context.candidates.filter((member) => member.provider && !seen.has(member.memberId)
    && ![...context.current, ...selected].some((existing) => existing.provider === member.provider));
  const distinctProviders = [...new Map(missingProviders.map((member) => [member.provider, member])).values()];
  return [...selected, ...selectCandidates(distinctProviders, context.input.diversityRole || 'generator', providerDeficit)];
}

function currentProviderCount(members) {
  return new Set(members.map((member) => member.provider).filter(Boolean)).size;
}

async function persist(input, candidate) {
  const member = { memberId: candidate.memberId, role: candidate.role, ...candidate };
  const validation = validateMember(member);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { code: 'BIOCENOSE_MEMBER_INVALID' });
  return recruitmentStore.recruit(input.db, {
    communityId: input.communityId, actorId: input.actorId, memberId: candidate.memberId,
    role: candidate.role, attributes: candidate, reason: 'ADAPTIVE_DIVERSITY_GAP', createdAt: new Date().toISOString()
  });
}

function remainingRoles(roles, recruited) {
  const filled = new Set(recruited.map((member) => member.role));
  return roles.filter((role) => !filled.has(role));
}

function allowedPhase(phase) {
  return ['CONSTITUTION', 'FORMATION', 'REVIEW', 'DELIBERATION', 'REVISION'].includes(phase);
}

module.exports = { recruit, normalizeMembers };
