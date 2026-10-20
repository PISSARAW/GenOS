'use strict';

const assert = require('node:assert/strict');
const reader = require('../src/services/topology/workerResultReader.cjs');
const { buildBiologicalOutput } = require('../src/services/topology/biologicalOutputBuilder.cjs');
const { handleBiologicalCondition } = require('../src/services/topology/biologicalConditions.cjs');

function database(status, report, eventId = 7) {
  return {
    get: async (sql) => String(sql).includes('telemetry_events')
      ? (report ? { id: eventId, payload_json: JSON.stringify({ evidenceReport: report }) } : undefined)
      : { status }
  };
}

async function verifiedResult() {
  const member = { workerId: 'worker-1', role: 'solver', status: 'completed' };
  const report = { outcome: 'success', workerArtifact: { content: {
    claims: [{ statement: 'Verified worker answer.' }]
  } } };
  await reader.readAll(database('completed', report), [member]);
  assert.deepEqual(member.result, {
    workerId: 'worker-1', role: 'solver', status: 'completed', verified: true,
    answer: 'Verified worker answer.', evidenceEventId: 7, outcome: 'success'
  });
  const output = buildBiologicalOutput({
    context: { orchestratorId: 'orchestrator', dispatchFailures: [] },
    mode: 'biocenose', mission: 'answer', members: [member], accepted: [member], topology: {}
  }).biologicalMode;
  assert.equal(output.status, 'completed');
  assert.deepEqual(output.results, [member.result]);
  assert.match(output.answer, /Verified worker answer/);
}

async function unverifiedResult() {
  const member = { workerId: 'worker-2', role: 'reviewer', status: 'completed' };
  await reader.readAll(database('completed'), [member]);
  assert.equal(member.result.status, 'unverified');
  const output = buildBiologicalOutput({
    context: { orchestratorId: 'orchestrator', dispatchFailures: [] },
    mode: 'holobionte', mission: 'review', members: [member], accepted: [member], topology: {}
  }).biologicalMode;
  assert.equal(output.status, 'partial');
  assert.equal(output.answer, '## reviewer\nAucune réponse vérifiée.');
}

async function specializedResultIsPreserved() {
  const member = { workerId: 'worker-3', role: 'population', status: 'completed',
    result: { status: 'unverified', methodValidated: false } };
  const report = { outcome: 'success', answer: 'Candidate answer.' };
  await reader.readAll(database('completed', report), [member]);
  assert.equal(member.result.status, 'unverified');
  assert.equal(member.result.methodValidated, false);
  assert.equal(member.result.answer, 'Candidate answer.');
}

async function conditionRequiresCompletedWorkers() {
  const complete = { biologicalMode: { complete: true, status: 'completed',
    members: [{ status: 'completed' }] } };
  assert.equal(handleBiologicalCondition('biocenose', complete), false);
  complete.biologicalMode.members[0].status = 'error';
  assert.equal(handleBiologicalCondition('biocenose', complete), true);
}

async function main() {
  await verifiedResult();
  await unverifiedResult();
  await specializedResultIsPreserved();
  await conditionRequiresCompletedWorkers();
  console.log('Worker result reader: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
