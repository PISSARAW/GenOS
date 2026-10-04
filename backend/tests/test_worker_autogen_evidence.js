'use strict';

const assert = require('node:assert/strict');
const { CASES, score } = require('../../benchmarks/workers/campaign.cjs');
const { digest, parseAssignments, scheduleOutput, verifiedAutoGen } = require('../../benchmarks/workers/autogen-evidence.cjs');

const testCase = CASES.find((item) => item.id === 'lpt-schedule');
const rawOutput = '```json\n[{"machine":1,"jobs":["A"]},{"machine":2,"jobs":["B","C"]}]\n```';
const assignments = parseAssignments(rawOutput);
const output = scheduleOutput(assignments, testCase.methodContract.parameters);
assert.equal(output.makespan, 7);
const execution = { status: 'executed', result: { output }, receipt: { id: digest(rawOutput) },
  provenance: { agentFramework: 'autogen-agentchat', rawOutput, model: 'fixture', frameworkVersion: 'fixture' } };
assert.equal(verifiedAutoGen(testCase, execution), true);
assert.equal(scheduleOutput([{ machine: 1, jobs: ['A', 'A'] }, { machine: 2, jobs: ['B', 'C'] }],
  testCase.methodContract.parameters), null);
assert.equal(verifiedAutoGen(testCase, { ...execution, result: { output: { ...output, makespan: 8 } } }), false);
assert.equal(verifiedAutoGen(testCase, { ...execution, receipt: { id: digest('different') } }), false);

async function run() {
  assert.equal(await score(testCase, execution), 'passed');
  assert.equal(await score(testCase, { ...execution, result: { output: { ...output, makespan: 8 } } }), 'failed');
}

run().then(() => console.log('AutoGen rival evidence: PASS')).catch((error) => { console.error(error); process.exitCode = 1; });
