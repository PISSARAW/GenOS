'use strict';
const { createMockMembers } = require('./fixtures/ateamVariantTestHelpers');

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

  const context = { members, boundaries, passed: 0, failed: 0 };
  await require('./ateamAcceptance/expert_committee')(context);
  await require('./ateamAcceptance/pipeline')(context);
  await require('./ateamAcceptance/project_dag')(context);
  await require('./ateamAcceptance/cross_functional_pod')(context);
  await require('./ateamAcceptance/boundary_spanner')(context);
  await require('./ateamAcceptance/matrix_team')(context);
  await require('./ateamAcceptance/tiger_team')(context);
  await require('./ateamAcceptance/incident_command')(context);
  await require('./ateamAcceptance/multiteam')(context);
  await require('./ateamAcceptance/adaptive')(context);
  await require('./ateamAcceptance/relay_team')(context);
  console.log('A-Team variant acceptance: ' + context.passed + ' passed, ' + context.failed + ' failed.');
  if (context.failed) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
