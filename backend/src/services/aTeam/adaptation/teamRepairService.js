'use strict';

const { observeStaffingGaps } = require('./staffingGapObserver');
const { planReplacement } = require('./memberReplacementService');
const { planReassignment } = require('./responsibilityReassignmentService');
const { planRecruitment } = require('./recruitmentService');
const { planTeamMorphogenesis } = require('../learning/aTeamMorphogenesisBridge');
const { routeKnowledgeNeed } = require('../memory/knowledgeRoutingService');

function planForGap(input, gap, failedMember) {
  const reassignment = planReassignment({ gap, members: input.members, failedMemberId: failedMember?.agentId || failedMember?.memberId });
  if (reassignment.status === 'REASSIGN') return reassignment;
  return planRecruitment({ gap, candidates: input.candidates, budget: input.budget, availableSlots: input.availableSlots, performancePriors: input.performancePriors });
}

function planRepair(input = {}) {
  const observation = observeStaffingGaps({ capabilityGaps: input.gaps, members: input.members });
  const failed = observation.failedMembers[0];
  if (failed) {
    const replacement = planReplacement({
      failedMember: failed, candidates: input.candidates,
      budget: input.budget, availableSlots: input.availableSlots, performancePriors: input.performancePriors
    });
    if (replacement.status === 'REPLACE') return attachMorphogenesis(input, { ...replacement, workGraphNeedsRecompile: true });
  }
  const gap = observation.capabilityGaps[0];
  if (!gap) return { status: 'NO_ACTION', workGraphNeedsRecompile: false };
  const decision = planForGap(input, gap, failed);
  const repair = { ...decision, workGraphNeedsRecompile: decision.status === 'REASSIGN' || decision.status === 'RECRUIT' };
  return attachMorphogenesis(input, repair);
}

async function planRepairWithMemory(input = {}) {
  const gap = (input.gaps || [])[0];
  if (!gap || typeof input.findExperts !== 'function') return planRepair(input);
  const route = await routeKnowledgeNeed({
    db: input.db, findExperts: input.findExperts,
    capability: gap.capability || gap.name, need: gap.reason || gap.capability || gap.name,
    members: input.members, freshness: input.freshness
  });
  if (route.status === 'ROUTED' && !isTeamMember(input.members, route.expert.agentId)) {
    return { status: 'CONSULT', workGraphNeedsRecompile: false, knowledgeRoute: route };
  }
  return { ...planRepair(input), knowledgeRoute: route };
}

function isTeamMember(members, agentId) {
  return (Array.isArray(members) ? members : []).some((member) => (member.agentId || member.memberId) === agentId);
}

function attachMorphogenesis(input, decision) {
  if (!decision.workGraphNeedsRecompile) return decision;
  const morphogenesis = planTeamMorphogenesis({
    mission: input.mission || { goal: input.goal },
    morphologyContext: input.morphologyContext,
    budget: input.budget,
    reason: `a_team_${String(decision.status).toLowerCase()}`
  });
  return { ...decision, morphogenesis };
}

module.exports = { planRepair, planRepairWithMemory };
