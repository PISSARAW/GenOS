'use strict';

const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');
const rounds = require('../src/services/agentRoundService');
const garage = require('../src/services/garageRuntimeService');
const missionExecution = require('../src/services/agentRuntimeAdapter/missionExecution');

async function main() {
  const workerId = `round-release-worker-${Date.now()}`;
  const originalFinalize = garage.finalizeAgent;
  const originalResume = rounds.resumeMorphogenesisBarrierForWorker;
  let resumed = false;
  garage.finalizeAgent = async () => {};
  rounds.resumeMorphogenesisBarrierForWorker = async (id) => {
    assert.equal(id, workerId);
    assert.equal(state.missionStarts.has(workerId), false,
      'round continuation must be attempted only after releasing the mission-start guard');
    resumed = true;
  };
  state.missionStarts.set(workerId, Promise.resolve());
  try {
    await missionExecution.finalizeMissionStart(workerId);
    assert.equal(resumed, true,
      'mission finalization must retry the morphogenesis barrier after worker shutdown');
    console.log('Mission finalization resumes a quiescent morphogenesis round: PASS');
  } finally {
    state.missionStarts.delete(workerId);
    garage.finalizeAgent = originalFinalize;
    if (originalResume) rounds.resumeMorphogenesisBarrierForWorker = originalResume;
    else delete rounds.resumeMorphogenesisBarrierForWorker;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
