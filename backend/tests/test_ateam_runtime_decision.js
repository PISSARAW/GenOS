const assert = require('node:assert/strict');
const { evaluateRuntimeDecision } = require('../src/services/aTeamRuntimeDecisionService');

const plan = {
  planId: 'plan-runtime', orchestratorId: 'orch-runtime',
  members: [
    { workerId: 'w-api', subSystem: 'api', role: 'api_engineer', pipelineStage: 0, dependsOn: [] },
    { workerId: 'w-integration', subSystem: 'integration', role: 'integration_observer', pipelineStage: 1, dependsOn: ['api'] }
  ]
};
const reports = {
  'w-api': [{ payload_json: JSON.stringify({ outcome: 'success', coverage: 0.9, claims: [{ statement: 'The domain deliverable is complete and verified.', evidence: ['build receipt'] }], tests: [{ name: 'api', passed: true }] }) }],
  'w-integration': [{ payload_json: JSON.stringify({ outcome: 'success', coverage: 0.9, integrationConstraints: ['The consumer verified the producer output.'], claims: [{ statement: 'The integrated result is complete and verified.', evidence: ['integration receipt'] }], tests: [{ name: 'integration', passed: true }] }) }]
};
const db = { all: async (sql, workerId) => reports[workerId] || [] };
const successfulStages = [{ stage: 1, launched: 'w-integration' }];
const successfulWorkers = { timedOut: false, failedWorkerIds: [], pendingWorkerIds: [] };

(async () => {
  const completed = await evaluateRuntimeDecision({ db, plan, stageResults: successfulStages, workerWait: successfulWorkers });
  assert.equal(completed.decision, 'completed');
  assert.equal(completed.integration.canMerge, true);

  const missing = await evaluateRuntimeDecision({
    db: { all: async (sql, workerId) => workerId === 'w-api' ? reports[workerId] : [] },
    plan, stageResults: successfulStages, workerWait: successfulWorkers
  });
  assert.equal(missing.decision, 'blocked');
  assert.equal(missing.reason, 'domain_dossier_missing');
  assert.deepEqual(missing.missingDomains, ['integration']);

  const failedDependency = await evaluateRuntimeDecision({
    db, plan, stageResults: [{ stage: 1, blocked: true, reason: 'dependency_failed' }], workerWait: successfulWorkers
  });
  assert.equal(failedDependency.decision, 'blocked');
  console.log('A-Team terminal decision requires all dossiers and successful arbitration: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
