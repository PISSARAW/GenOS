'use strict';

async function finalize(input) {
  const { db, missionId, orchestratorId, task, evaluateMissionContinuity } = input;
  const continuity = require('../src/services/missionContinuityService');
  const identity = require('../src/services/missionIdentityService');
  const current = await continuity.effectiveMissionOutcome(db, missionId);
  const evaluation = await evaluateMissionContinuity({
    db, id: orchestratorId, task, outcome: current.outcome, agents: current.members
  });
  const complete = evaluation.completionGate.allowed === true && evaluation.outcome.success === true;
  await identity.setStatus(db, missionId, complete ? 'completed' : 'failed');
}

module.exports = { finalize };
