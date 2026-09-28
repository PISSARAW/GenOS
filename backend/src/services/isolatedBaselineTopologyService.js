'use strict';

function compose(input = {}) {
  const biological = require('./biologicalModeService');
  const workerKinds = require('./topologyWorkerKindService');
  const variantWorkers = require('./syncytiumVariantWorkerService');
  const assignments = input.options?.workerAssignments || {};
  const members = biological.compose('syncytium', input.mission, { workerAssignments: assignments });
  const variantMembers = variantWorkers.membersForSession({
    mission: input.mission,
    variantPolicy: { id: input.options?.variantId || input.options?.variant }
  });
  const allMembers = [...members, ...variantMembers].map((member, index) => ({
    ...member,
    executionMode: 'worker',
    mission: independentMission({ mission: input.mission, member, index })
  }));
  return {
    members: workerKinds.applyTopologyWorkerKinds('syncytium', { members: allMembers }, assignments).members,
    baseline: 'isolated', sharedState: false
  };
}

function independentMission({ mission, member, index }) {
  return `Independent baseline worker ${index + 1} (${member.role}): solve without shared state, other workers' drafts, or shared revisions. Return your own outcome, evidence, assumptions, and unresolved contradictions.\nMission: ${mission}`;
}

module.exports = { compose };
