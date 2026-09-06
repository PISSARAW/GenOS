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
  console.log('collective calibration: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
