'use strict';
const assert = require('node:assert/strict');
const options = require('../src/services/hierarchicalOptionService');
const valence = require('../src/services/postActionValenceService');
const canonical = require('../src/services/deterministicFinalReportService');
const synthesis = require('../src/services/localRuntimeSynthesis');
async function optionChecks() {
  const option = { id: 'repair', maxSteps: 3, initiation: (state) => state.tests < 2,
    termination: (state) => state.tests >= 2, policy: (state) => state.tests ? 'verify' : 'repair' };
  const calls = [];
  const runtime = { authorize: async () => true, execute: async ({ action, state }) => {
    calls.push(action); return { state: { tests: state.tests + 1 }, reward: 1 };
  } };
  assert.equal((await options.runOption(option, { tests: 0 }, runtime)).status, 'terminated');
  assert.deepEqual(calls, ['repair', 'verify']);
  const denied = await options.runOption(option, { tests: 0 }, { ...runtime, authorize: async () => false });
  assert.equal(denied.status, 'blocked');
  assert.equal(denied.steps, 0);
  assert.equal(calls.length, 2);
  assert.equal((await options.runOption({ ...option, maxSteps: 1 }, { tests: 0 }, runtime)).status, 'budget_exhausted');
  await immutableOptionChecks(option, runtime);
}

async function immutableOptionChecks(option, runtime) {
  const mutable = { ...option, maxSteps: 1, termination: () => false,
    policy: () => { mutable.maxSteps = 32; return { tool: 'safe' }; } };
  const actions = [];
  const result = await options.runOption(mutable, { tests: 0 }, { ...runtime,
    authorize: async ({ action }) => { action.tool = 'mutated'; return true; },
    execute: async ({ action }) => { actions.push(action.tool); return { state: { tests: 1 }, reward: 0 }; } });
  assert.equal(result.steps, 1);
  assert.deepEqual(actions, ['safe']);
  assert.equal(result.trajectory[0].action.tool, 'safe');
}
function valenceChecks() {
  const before = Object.fromEntries(['energy', 'memoryPressure', 'modelDrift', 'contextPressure', 'integrity', 'stress', 'socialState'].map((key) => [key, 0.5]));
  const predicted = { ...before, energy: 0.8 };
  const prediction = valence.predict({ actionId: 'v', before, predicted });
  assert.ok(prediction.expectedValue > 0);
  assert.equal(valence.observe(prediction, { actionId: 'other', state: predicted }).status, 'unmatched');
  assert.equal(valence.observe(prediction, { actionId: 'v', state: predicted }).predictionError, 0);
  assert.equal(valence.predict({ actionId: 'v', before: {}, predicted }).status, 'insufficient_data');
}
async function reportChecks() {
  const dossier = { workerId: 'w', events: [{ evidenceReport: { outcome: 'success',
    claims: [{ statement: 'Exact claim 42', evidence: ['source:42'] }] } }] };
  const plan = { synthesisOnly: true, completedWorkerIds: ['w'], completedWorkerDossiers: [dossier] };
  const report = canonical.compile(plan);
  assert.equal(report.claims[0].statement, 'Exact claim 42');
  assert.equal(report.promotionAllowed, false);
  assert.deepEqual(report.dossierInfluence[0].usedClaims, ['Exact claim 42']);
  assert.deepEqual(canonical.compile(plan), report);
  assert.deepEqual(JSON.parse(await synthesis.canonicalGeneration(plan).generation), report);
  assert.throws(() => canonical.compile({ ...plan, completedWorkerIds: ['missing'] }), /every expected/);
  const negative = structuredClone(plan);
  negative.completedWorkerDossiers[0].events[0].evidenceReport.outcome = 'failed';
  assert.equal(canonical.compile(negative).outcome, 'failed');
  assert.throws(() => synthesis.parseCompletionReply(synthesis.canonicalReply(negative)), /failed or uncertain/);
}
async function main() {
  await optionChecks(); valenceChecks(); await reportChecks();
  console.log('Authorized HRL, correlated valence and model-free canonical reporting checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
