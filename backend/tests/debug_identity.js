const { getDatabase } = require('../src/db');
const substanceService = require('../src/services/substanceService');

async function test() {
  // Recreate the test beings
  const { defineBeing } = require('../src/services/ontologyService');
  await defineBeing('debug-sub-1', { type: 'worker', role: 'coder', purpose: 'code', agentDna: null, teleology: 'task_execution' });
  await defineBeing('debug-sub-2', { type: 'worker', role: 'coder', purpose: 'code', agentDna: null, teleology: 'task_execution' });
  
  const result = await substanceService.checkSubstanceIdentity('debug-sub-1', 'debug-sub-2');
  console.log('Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);