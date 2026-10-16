'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeCondition, topologyProfile, evidenceOf } = require('./comparisonAdapters.cjs');
const transitions = require('../../backend/src/services/morphogenesis/morphogenesisTransitionReceipt');
const { validateExternalDataset } = require('./run-comparison-campaign.cjs');
const { verifyCandidate } = require('./oracles.cjs');

test('conditional router changes the execution shape from declared query profile', () => {
  assert.equal(topologyProfile({ routingHint: 'single' }), 'single');
  assert.equal(topologyProfile({ routingHint: 'dependencies' }), 'team');
  assert.equal(topologyProfile({ routingHint: 'search' }), 'team');
});

test('the five adapters produce oracle-checkable outputs with measured budgets and messages', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  const answer = { remaining: 21, perGroup: 3, remainder: 0 };
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ model: 'fixture-model', prompt_eval_count: 4,
      eval_count: 3, message: { content: JSON.stringify(answer) } }) };
  };
  try {
    const task = { id: 'arithmetic', prompt: 'calcule 24-3 puis divise par 7', oracle: 'verifyArithmeticPartition', routingHint: 'search' };
    const cases = [
      { id: 'model-alone', adapter: 'direct-model', messages: 1 },
      { id: 'simple-multi-agent', adapter: 'fixed-team', messages: 4 },
      { id: 'conditional-router', adapter: 'conditional-router', messages: 4 },
      { id: 'mechanism-ablation', adapter: 'communication-light', messages: 4 },
      { id: 'morphogenesis', adapter: 'genos-full', messages: 1 }
    ];
    for (const condition of cases) {
      calls = 0;
      const context = { tokens: 1000, latencyMs: 5000, model: 'fixture-model', seed: 5, workspace: '.', dbPath: ':memory:' };
      if (condition.adapter === 'genos-full') context.genosExecutor = async () => ({
        orchestratorId: 'fixture-orchestrator', success: true,
        token_usage: { totalTokens: 7, allRunsCompleted: true, executionRuns: [{ status: 'completed' }] },
        telemetry: [{ event_type: 'EVIDENCE_REPORT', payload_json: JSON.stringify({ report: {
          claims: [{ statement: JSON.stringify(answer) }],
          workerArtifact: { provenance: { model: 'ollama://fixture-model' } }
        } }) }], coverage: { protocol: { observedCount: 0 } }
      });
      const result = await executeCondition(condition, task, context);
      assert.equal(result.error, null, result.error);
      assert.equal(result.messageCount, condition.messages);
      assert.equal(calls, condition.adapter === 'genos-full' ? 0 : condition.messages);
      assert.equal(result.tokenUsage.total, condition.adapter === 'genos-full' ? 7 : condition.messages * 7);
      assert.equal(result.tokenUsage.measured, true);
      assert.equal(result.servedModel, 'fixture-model');
      assert.equal(verifyCandidate(task, result.candidate).passed, true);
      assert.equal(result.toolUseCount, 0);
    }
  } finally { global.fetch = originalFetch; }
});

test('confirmatory dataset refuses bundled pilot tasks and missing separated inventories', () => {
  assert.throws(() => validateExternalDataset(require('./comparison-task-set.json'), 'confirmatory'), /datasetId, source and tasks/);
  const task = { id: 'holdout-1', family: 'new-family', comparisonEligible: true,
    prompt: 'independent question', oracle: { type: 'structured' } };
  assert.throws(() => validateExternalDataset({ datasetId: 'external', source: 'registry',
    tasks: [task], split: 'holdout' }, 'confirmatory'), /inventories/);
});

test('comparison evidence requires a sealed transition and its exact verified resolution', () => {
  const workerId = 'qualified-worker';
  const state = { workers: new Map([[workerId, { workerKind: 'scout_cell',
    morphologyTopology: 'trinity', morphologyVariant: 'pareto' }]]) };
  const adaptation = { receipt: {}, admission: { status: 'admitted',
    selectionBasis: 'calibrated_policy_proposal', recipe: {
      id: 'variant:trinity:pareto', topology: 'trinity', variant: 'pareto' } },
  plan: { morphologyPatch: { graph: { graphId: 'comparison-graph', version: 1 } } } };
  const sealed = transitions.sealTransitionReceipt({ state, survivors: [{ agentId: workerId }],
    continuation: { perWorkerTokens: 100 }, adaptation });
  transitions.finalizeTransitionQueue(sealed, [workerId]);
  const started = { event_type: 'MORPHOGENESIS_EPOCH_STARTED',
    payload_json: JSON.stringify({ transition: sealed }) };
  const resolved = { event_type: 'MORPHOGENESIS_EPOCHS_STOPPED',
    payload_json: JSON.stringify({ reason: 'verified_resolution', transitionId: sealed.transitionId }) };
  const observed = evidenceOf({ receipt: { telemetry: [started, resolved] } });
  assert.equal(observed.transitionId, sealed.transitionId);
  assert.equal(observed.candidateId, 'variant:trinity:pareto');
  assert.equal(observed.workerCount, 1);
  assert.equal(observed.resolutionVerified, true);
  const tampered = structuredClone(sealed);
  tampered.identity.candidateId = 'another-candidate';
  assert.equal(evidenceOf({ receipt: { telemetry: [{ ...started,
    payload_json: JSON.stringify({ transition: tampered }) }, resolved] } }).transitionId, null);
  assert.equal(evidenceOf({ receipt: { telemetry: [started, { ...resolved,
    payload_json: JSON.stringify({ reason: 'verified_resolution',
      transitionId: 'other-transition' }) }] } }).resolutionVerified, false);
});
