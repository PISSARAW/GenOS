const assert = require('node:assert/strict');
const { finishContext, validateCallerReport } = require('../bin/caller-mcp-context.cjs');
const { analyzeMission } = require('../src/services/aTeamService');
const { classifyProblem } = require('../src/strategies/strategySelector');
const { buildExecutionBudget } = require('../src/services/agentFleetWorkers');

assert.throws(() => validateCallerReport('plain story'), SyntaxError);
assert.throws(() => validateCallerReport('{"author":{"name":"host"}}'), /explicit outcome/);
assert.throws(() => validateCallerReport('{"outcome":"success","claims":[]}'), /claims/);
assert.throws(() => validateCallerReport(JSON.stringify({ outcome: 'success', claims: [{}], artifact: 'creative' })), /artifactText/);
assert.equal(validateCallerReport('{"outcome":"failed"}').outcome, 'failed');
assert.equal(validateCallerReport('{"outcome":"no_answer"}').outcome, 'no_answer');
assert.throws(() => validateCallerReport('{"outcome":"unresolved"}'), /explicit outcome/);

const workerMission = { executionMode: 'worker', workerKind: 'red_worker', role: 'Verifier', prompt: 'Verify the claim.' };
assert.equal(validateCallerReport('{"outcome":"failed"}', workerMission).outcome, 'failed');
assert.equal(validateCallerReport('{"outcome":"no_answer"}', workerMission).outcome, 'no_answer');
const validWorkerReport = {
  outcome: 'success',
  claims: [{ statement: 'The claim passed verification.', evidence: ['mission'] }],
  uncertainties: [],
  artifactText: '<ARTIFACT: verification_report>Verification completed.</ARTIFACT>',
  workerArtifact: {
    type: 'verification_report',
    content: {
      testedClaim: 'The claim passed verification.', verificationMethod: 'Independent reproduction',
      verdict: 'accept', reproductionSteps: ['Run the reproduction.'], evidence: ['mission'], counterexamples: []
    },
    provenance: { sourceRefs: ['mission'] }
  }
};
assert.equal(validateCallerReport(JSON.stringify(validWorkerReport), workerMission).outcome, 'success');
assert.throws(() => validateCallerReport(JSON.stringify({ ...validWorkerReport, workerArtifact: undefined }), workerMission),
  (error) => error.code === 'CALLER_WORKER_RESPONSE_SCHEMA_INVALID');
assert.throws(() => validateCallerReport(JSON.stringify({ ...validWorkerReport, artifactText: undefined }), workerMission),
  (error) => error.code === 'CALLER_WORKER_RESPONSE_SCHEMA_INVALID');
assert.throws(() => validateCallerReport(JSON.stringify({
  ...validWorkerReport,
  claims: [{ statement: 'Unsupported evidence ref.', evidence: ['invented'] }]
}), workerMission), (error) => error.code === 'CALLER_WORKER_RESPONSE_SCHEMA_INVALID');

async function verifyRuntimeRejectsIncompleteWorker() {
  const state = { isWorker: true, mission: workerMission };
  await assert.rejects(finishContext(state, JSON.stringify({
    ...validWorkerReport, workerArtifact: undefined
  })), (error) => error.code === 'CALLER_WORKER_RESPONSE_SCHEMA_INVALID');
  assert.equal(state.finalReportText, undefined, 'invalid worker output must be rejected before completion handling');
}

const fiction = analyzeMission('Écris une courte histoire littéraire en français.');
assert.equal(fiction.primaryDomain, 'creative_writing');
assert.equal(fiction.members.length, 3);
assert.equal(classifyProblem('Écris une courte histoire littéraire en français.'), 'creative_writing');
const budgets = [0, 1].map((index) => buildExecutionBudget({ executionBudget: { costUsd: 1, events: 100 }, index, assignmentCount: 2, assignedTokens: 9000 }));
assert.deepEqual(budgets.map((budget) => budget.costUsd), [0.5, 0.5]);
assert.equal(budgets.reduce((total, budget) => total + budget.costUsd, 0), 1);
verifyRuntimeRejectsIncompleteWorker().then(() => {
  console.log('Caller MCP report and creative classification tests passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
