const assert = require('node:assert/strict');
const recall = require('../src/services/autobiographicalMemory/orchestratorRecall');

function fakeDb() {
  return {
    all: async (query) => query.includes('autobiographical_episodes')
      ? [{ id: 'episode-1', agent_id: 'orch-1', mission_id: null, kind: 'strategy_change', salience: 0.8, situation_json: '{"goal":"repair orchestration"}', decision_json: '{"selectedStrategy":"safe-retry"}', action_json: '{}', outcome_json: '{"status":"success"}', lesson_json: '{}', is_forgotten: 0, created_at: new Date().toISOString() }]
      : [{ id: 'lesson-1', scope: 'strategy_change', claim: 'Prefer safe-retry', confidence: 0.8, supporting_episodes_json: '["episode-1"]', counter_examples_json: '[]', reuse_conditions_json: '["strategy_change"]', avoid_conditions_json: '[]', recommended_action: 'reuse_strategy_first', updated_at: new Date().toISOString() }]
  };
}

async function run() {
  const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.35, evidenceStrictness: 0.82 }, limits: {} } };
  const result = await recall.recallBeforePlanning({
    db: fakeDb(),
    agentId: 'orch-1',
    normalizedMission: { prompt: 'repair orchestration', kind: 'strategy_change' },
    autonomyPlan: plan
  });
  assert.equal(result.episodes.length, 1);
  assert.equal(result.lessons.length, 1);
  assert.equal(plan.autobiographicalRecall.recalled, true);
  assert.equal(plan.autobiographicalAdjustments.confidenceBoost, 0.05);
  assert.equal(plan.selfModel.decisionPolicy.confidenceBoost, undefined);
  assert.equal(plan.selfModel.decisionPolicy.riskTolerance, 0.35);
  assert.equal(plan.selfModel.decisionPolicy.evidenceStrictness, 0.82);
  assert.equal(plan.selfModel.limits.riskTolerance, 0.35);
  console.log('Autobiographical orchestrator recall integration passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
