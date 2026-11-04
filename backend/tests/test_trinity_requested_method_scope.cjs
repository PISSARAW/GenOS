'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const trinity = require('../src/services/trinityService');
const diversity = require('../src/services/trinityModelDiversityService');

async function plan(alias) {
  const members = trinity.compose('Infer bounded functions from public observations');
  const method = {version: 1, methodId: 'prompt_defined', requiredEvidence: ['functionPrograms'],
    evaluator: {domain: 'bounded_function_induction', version: 1},
    parameters: {context: {observations: [], requested: [{op: 'op_1234abcd', epoch: 0}]}}};
  const input = {autonomyPlan: {trinity: {activated: true, members,
    variantSelection: {experimentalDesign: {diversityPolicy: 'homogeneous'}}}},
  normalizedMission: {[alias]: Object.fromEntries(members.map(member => [member.role, {methodContract: method}]))}};
  await diversity.enforcePlan(input);
  return input.autonomyPlan.trinity.members;
}

async function main() {
  const [camel, snake] = await Promise.all([plan('workerAssignments'), plan('worker_assignments')]);
  for (const [index, member] of snake.entries()) {
    assert.deepEqual(member.methodContract, camel[index].methodContract);
    assert.equal(member.methodContract.evaluator.domain, 'bounded_function_induction');
    assert.deepEqual(member.methodContract.requiredEvidence, ['functionPrograms']);
    assert.equal(member.workerProfile.methodId, 'prompt_defined');
  }
  console.log('The public MCP assignment alias survives the actual dedicated Trinity preflight and sealed role selection: PASS');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
