'use strict';

const assert = require('node:assert/strict');
const validation = require('../src/services/mcpArgumentValidation');
const topology = require('../src/services/biologicalTopologyService');

async function testRoleOverrideRejected() {
  const assignment = { specialist_symbiont: { role: 'host_orchestrator' } };
  const schemas = [
    ['genos_orchestrate', { mission: 'Review a change.' }],
    ['genos_trinity_launch', { mission: 'Review a change.' }],
    ['genos_a_team_preview', { project_goal: 'Review a change.' }],
    ['genos_biological_mode', { mode: 'holobionte', mission: 'Review a change.' }]
  ];
  for (const [tool, args] of schemas) {
    const error = validation.validateToolArguments(tool, { ...args, worker_assignments: assignment });
    assert.equal(error?.code, 'INVALID_TOOL_ARGUMENTS', `${tool} must reject identity overrides`);
  }

  await assert.rejects(topology.composeMode({ mode: 'holobionte', mission: 'Review a change.',
    workerAssignments: assignment }), { code: 'TOPOLOGY_WORKER_ASSIGNMENT_FIELD_INVALID' });
}

async function testDerivedSummaryUsesFinalMembers() {
  const composition = await topology.composeMode({ mode: 'holobionte', mission: 'Review a change.',
    workerAssignments: { specialist_symbiont: {
      workerRequirements: { allowedKinds: ['symbiotic_worker'] },
      methodContract: { version: 1, methodId: 'prompt_defined' }
    } } });
  const host = composition.members.find((member) => member.role === 'host_orchestrator');
  const specialist = composition.members.find((member) => member.role === 'specialist_symbiont');
  assert.equal(composition.host, host);
  assert.ok(composition.symbiotes.every((member) => composition.members.includes(member)));
  assert.equal(composition.symbiotes.find((member) => member.role === 'specialist_symbiont'), specialist);
  assert.equal(specialist.workerKind, 'symbiotic_worker');
  assert.equal(composition.engines.specialist_symbiont, specialist.engine);
}

async function run() {
  await testRoleOverrideRejected();
  await testDerivedSummaryUsesFinalMembers();
}

run().then(() => console.log('Topology assignment integrity: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
