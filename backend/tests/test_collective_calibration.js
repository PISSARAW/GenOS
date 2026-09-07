const assert = require('assert');
const { brierScores } = require('../src/services/primitiveHandlers/collective');

async function run() {
  const result = await brierScores({
    agentIds: ['agent-a'],
    calibrationObservations: [
      { agentId: 'agent-a', prediction: 0.8, outcome: 1 },
      { agentId: 'agent-a', prediction: 0.2, outcome: 0 }
    ]
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.scores['agent-a'], 0.04);

  const missing = await brierScores({ agentIds: ['agent-a'] });
  assert.strictEqual(missing.success, false);

  const fallback = await brierScores({
    agentIds: ['agent-uncalibrated'],
    allowDefaults: true,
    defaultScore: 0.25
  });
  assert.strictEqual(fallback.success, true);
  assert.strictEqual(fallback.scores['agent-uncalibrated'], 0.25);

  // Multi-class categorical evaluation
  const multiclassResult = await brierScores({
    agentIds: ['agent-multi'],
    calibrationObservations: [
      { agentId: 'agent-multi', prediction: [0.7, 0.2, 0.1], outcome: [1, 0, 0] },
      { agentId: 'agent-multi', prediction: [0.7, 0.2, 0.1], outcome: 0 },
      { agentId: 'agent-multi', prediction: { yes: 0.8, no: 0.2 }, outcome: 'yes' }
    ]
  });
  assert.strictEqual(multiclassResult.success, true);
  // Avg of 0.07, 0.07, 0.04 = 0.18 / 3 = 0.06
  assert.strictEqual(multiclassResult.scores['agent-multi'], 0.06);

  console.log('collective calibration: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
