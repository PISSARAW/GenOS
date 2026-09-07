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

  console.log('collective calibration: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
