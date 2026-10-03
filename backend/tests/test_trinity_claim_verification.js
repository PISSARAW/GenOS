'use strict';

const assert = require('node:assert/strict');
const { TrinityController } = require('../src/services/morphogenesis/controllers/trinityController');

async function main() {
  const controller = new TrinityController({ nodeId: 'trinity-test', topology: 'trinity' }, {});
  await controller.compose();
  const result = await controller.execute({ hypotheses: [{ claim: 'candidate', confidence: 0.9 }] });
  assert.deepEqual(result.verified_claims, [], 'confidence alone is not verification');
  assert.equal(result.candidate_claims.length, 1, 'candidate remains available for a real verifier');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
