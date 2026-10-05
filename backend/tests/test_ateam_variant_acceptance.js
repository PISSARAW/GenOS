'use strict';

const { createMockMembers } = require('./fixtures/ateamVariantTestHelpers');
const categories = [
  require('./ateamVariants/expertCommittee'),
  require('./ateamVariants/pipeline'),
  require('./ateamVariants/projectDag'),
  require('./ateamVariants/crossFunctionalPod'),
  require('./ateamVariants/boundarySpanner'),
  require('./ateamVariants/matrixTeam'),
  require('./ateamVariants/tigerTeam'),
  require('./ateamVariants/incidentCommand'),
  require('./ateamVariants/multiteam'),
  require('./ateamVariants/adaptive'),
  require('./ateamVariants/relayTeam'),
];

async function run() {
  console.log('Running 44 A-Team variant acceptance tests...\n');

  const members = createMockMembers([
    { memberId: 'api', domain: 'api', role: 'backend', capabilities: ['api', 'rest'], expertise: ['api-design'] },
    { memberId: 'web', domain: 'web', role: 'frontend', capabilities: ['web', 'ui'], expertise: ['frontend'], dependsOn: ['api'] },
    { memberId: 'security', domain: 'security', role: 'security', capabilities: ['security'], expertise: ['threat-modeling'], dependsOn: ['api'] },
    { memberId: 'ops', domain: 'ops', role: 'operations', capabilities: ['ops'], expertise: ['incident-response'] },
    { memberId: 'planning', domain: 'planning', role: 'planning', capabilities: ['planning'], expertise: ['strategy'] }
  ]);

  const boundaries = { interfaces: [
    { id: 'api:web', from: 'api', to: 'web' },
    { id: 'api:security', from: 'api', to: 'security' }
  ]};

  let passed = 0;
  let failed = 0;
  for (const category of categories) {
    const result = await category(members, boundaries);
    passed += result.passed;
    failed += result.failed;
  }
  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
