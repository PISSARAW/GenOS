'use strict';

const { observeStaffingGaps } = require('./staffingGapObserver');
const { planReplacement } = require('./memberReplacementService');
const { planReassignment } = require('./responsibilityReassignmentService');
const { planRecruitment } = require('./recruitmentService');
const { planTeamMorphogenesis } = require('../learning/aTeamMorphogenesisBridge');

function planForGap(input, gap, failedMember) {
  const reassignment = planReassignment({ gap, members: input.members, failedMemberId: failedMember?.agentId || failedMember?.memberId });
  if (reassignment.status === 'REASSIGN') return reassignment;
  return planRecruitment({ gap, candidates: input.candidates, budget: input.budget, availableSlots: input.availableSlots });
}

function planRepair(input = {}) {
  const observation = observeStaffingGaps({ capabilityGaps: input.gaps, members: input.members });
  const failed = observation.failedMembers[0];
  if (failed) {
    const replacement = planReplacement({
      failedMember: failed, candidates: input.candidates,
      budget: input.budget, availableSlots: input.availableSlots
    });
    if (replacement.status === 'REPLACE') return attachMorphogenesis(input, { ...replacement, workGraphNeedsRecompile: true });
  }
  const gap = observation.capabilityGaps[0];
  if (!gap) return { status: 'NO_ACTION', workGraphNeedsRecompile: false };
  const decision = planForGap(input, gap, failed);
  const repair = { ...decision, workGraphNeedsRecompile: decision.status === 'REASSIGN' || decision.status === 'RECRUIT' };
  return attachMorphogenesis(input, repair);
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

module.exports = { planRepair };
