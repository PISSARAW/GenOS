const { getDatabase } = require('../src/db');
const substanceService = require('../src/services/substanceService');
const { defineBeing, getBeing } = require('../src/services/ontologyService');

async function test() {
  await defineBeing('sub-ident-1', { type: 'worker', role: 'coder', purpose: 'code', agentDna: null, teleology: 'task_execution' });
  await defineBeing('sub-ident-2', { type: 'worker', role: 'coder', purpose: 'code', agentDna: null, teleology: 'task_execution' });
  
  const b1 = await getBeing('sub-ident-1');
  const b2 = await getBeing('sub-ident-2');
  console.log('b1 essence:', JSON.stringify(b1.essence));
  console.log('b2 essence:', JSON.stringify(b2.essence));
  
  const result = await substanceService.checkSubstanceIdentity('sub-ident-1', 'sub-ident-2');
  console.log('Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);