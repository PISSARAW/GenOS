const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyControlFeedback,
  regulateAutonomyPlan
} = require('../src/services/controlRegulationService');
const { applyExecutionPolicy } = require('../src/services/agentRuntimeAdapter/missionPlanning');
const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');

function basePlan() {
  return {
    tokenPolicy: { total: 100, minimumWorkerTokens: 10 },
    workers: [{ id: 'worker-1' }],
    dispatchWorkers: [{ id: 'worker-1' }],
    exploration: { requestedBranches: 1 },
    dispatchDecision: { selectedWorkers: 1 },
    survival: { constraints: {}, pressures: [] },
    omittedPhases: []
  };
}

test('control regulation re-arbitrates execution feedback', () => {
  const regulation = regulateAutonomyPlan(
    { problem_profile: { type: 'general', risk: 'low', uncertainty: 0.1 } },
    { tokens: 100, minimumWorkerTokens: 10 },
    basePlan()
  );
  const updated = applyControlFeedback(regulation, {
    exitCode: 1,
    evidenceScore: 0.4,
    replayVerified: false,
    tokensUsed: 140,
    errors: ['worker failed']
  });

  assert.equal(updated.feedbackCycles, 1);
  assert.equal(updated.feedback.exitCode, 1);
  assert.equal(updated.arbitration.actionMode, 'blocked');
  assert(updated.arbitration.vetoes.some((signal) => signal.target === 'action_plan'));
  assert(updated.arbitration.vetoes.some((signal) => signal.target === 'promotion'));
  assert(updated.arbitration.selectedCorrections.some((signal) => signal.target === 'worker_fanout'));
});

test('runtime applies feedback corrections to mission posture', () => {
  const mission = {
    prompt: 'diagnose',
    executionPolicy: { allowFileEdits: true, requestedWorkers: 4 },
    autonomousOrchestration: true
  };
  applyExecutionPolicy({
    normalizedMission: mission,
    dispatchedAgent: { execution_mode: 'orchestrator' },
    autonomyPlan: {
      controlRegulation: {
        arbitration: {
          actionMode: 'blocked',
          humanReviewRequired: false,
          selectedCorrections: [
            { target: 'worker_fanout', direction: 'inhibit', strength: 0.5 },
            { target: 'diagnostics', direction: 'amplify', strength: 0.9 },
            { target: 'action_plan', direction: 'block', strength: 1 }
          ]
        }
      }
    }
  });

  assert.equal(mission.autonomousOrchestration, false);
  assert.equal(mission.executionPolicy.actionMode, 'blocked');
  assert.equal(mission.executionPolicy.workerFanoutFactor, 0.5);
  assert.equal(mission.executionPolicy.workerFanoutLimit, 2);
  assert.equal(mission.executionPolicy.diagnosticsPriority, 0.9);
  assert.equal(mission.executionPolicy.allowFileEdits, true);
});

test('strategy pipeline returns the post-execution arbitration', async () => {
  const regulation = regulateAutonomyPlan(
    { problem_profile: { type: 'general', risk: 'low', uncertainty: 0.1 } },
    { tokens: 100 },
    basePlan()
  );
  const result = await strategyExecutionAdapter.executePipelineWithFeedback([], {
    agentId: 'feedback-test-agent',
    controlRegulation: regulation,
    evidenceScore: 0.2,
    replayVerified: false,
    tokensUsed: 120
  });

  assert.equal(result.success, true);
  assert.equal(result.controlRegulation.feedbackCycles, 1);
  assert(result.controlRegulation.arbitration.vetoes.some((signal) => signal.target === 'promotion'));
  assert(result.controlRegulation.arbitration.selectedCorrections.some((signal) => signal.target === 'worker_fanout'));
});

test('feedback arbitration is bounded against runaway cycles', () => {
  const regulation = { worldState: { profile: {}, tokens: 100, pressures: [] }, signals: [], feedbackCycles: 3 };
  const updated = applyControlFeedback(regulation, { exitCode: 0 });
  assert.equal(updated.feedbackCycles, 3);
  assert(updated.arbitration.vetoes.some((signal) => signal.reason.includes('maximum feedback')));
});
