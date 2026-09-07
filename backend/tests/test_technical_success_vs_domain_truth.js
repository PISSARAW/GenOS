const assert = require('assert');
const { classifyTurn, cherryPickGoldenPath } = require('../src/services/trajectoryService');
const mcpExecutor = require('../src/services/mcpExecutor');

let passedTests = 0;
function pass(msg) {
  passedTests++;
  console.log('  ✅ PASS: ' + msg);
}

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: TECHNICAL SUCCESS VS DOMAIN TRUTH                         ');
  console.log('========================================================================\n');

  // --- 1. Trajectory classification ---
  console.log('--- 1. Trajectory: classifyTurn ---');
  
  // Replace action without verification should be a Modification
  const turn1 = classifyTurn({ action: 'replace_file_content', success: true });
  assert.strictEqual(turn1.classification, 'Modification', 'Replace without verification should be Modification');
  
  // Replace action with verification should be a Breakthrough
  const turn2 = classifyTurn({ action: 'replace_file_content', success: true, verified: true });
  assert.strictEqual(turn2.classification, 'Breakthrough', 'Replace with verification should be Breakthrough');
  
  pass('classifyTurn correctly discriminates Modification vs Breakthrough based on verification');

  // --- 2. Trajectory golden path ---
  console.log('--- 2. Trajectory: cherryPickGoldenPath ---');
  
  const turns = [
    { step: 1, action: 'search', success: true },
    { step: 2, action: 'replace', success: true, verified: true }
  ];
  const goldenPathFail = cherryPickGoldenPath(turns, 'failed');
  assert.strictEqual(goldenPathFail.validGoldenPath, false, 'Failed trajectory should not have a valid golden path');
  assert.strictEqual(goldenPathFail.goldenPathSteps.length, 0, 'Failed trajectory should have 0 golden path steps');
  
  const goldenPathSuccess = cherryPickGoldenPath(turns, 'success');
  assert.strictEqual(goldenPathSuccess.validGoldenPath, true, 'Success trajectory should have a valid golden path');
  assert.strictEqual(goldenPathSuccess.goldenPathSteps.length, 2, 'Success trajectory should have golden path steps');
  
  pass('cherryPickGoldenPath correctly drops false golden paths on failed trajectories');
  
  console.log('\n========================================================================');
  console.log('  ALL ' + passedTests + ' TESTS PASSED!');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
