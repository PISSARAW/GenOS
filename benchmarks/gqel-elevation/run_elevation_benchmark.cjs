'use strict';
// Regression harness, NOT an experiment measuring a real model.
const { run } = require('../../backend/tests/test_gqel_v2.cjs');
async function main() {
  const passed = await run();
  console.log(JSON.stringify({ schema: 'genos.gqel-regression/v2', passed, syntheticModelReplies: true,
    actualModelGeneration: false, causalUpliftVsModelAlone: false, scientificClaimAllowed: false,
    historicalResultsOverwritten: false }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
