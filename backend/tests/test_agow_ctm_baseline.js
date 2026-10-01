'use strict';

const assert = require('node:assert/strict');
const baseline = require('../src/services/agow/experiments/ctmStyleBaselineService');
const experiments = require('../src/services/agow/agowExperimentService');
const benchmarks = require('../src/services/agow/experiments/agowBenchmarkProtocolService');

function database() {
  const objects = new Map();
  return { async get(_sql, scope, key) { return objects.has(`${scope}:${key}`) ? { payload_json: objects.get(`${scope}:${key}`) } : null; },
    async run(sql, scope, key, payload) { if (sql.includes('INSERT OR REPLACE INTO adaptive_state')) objects.set(`${scope}:${key}`, payload); return { changes: 1 }; } };
}

async function testBaselineExecution() {
  const candidates = [{ candidateId: 'low', selfRatedScore: 0.1 }, { candidateId: 'high', selfRatedScore: 1.5 }];
  const competition = baseline.compete({ candidates, temperature: 0.5 });
  assert.equal(competition.winner.candidateId, 'high');
  assert(Math.abs(competition.competitors.reduce((sum, item) => sum + item.activation, 0) - 1) < 1e-9);
  const receipt = await experiments.runCtmStyleBaseline({ agentId: 'ctm-test', db: database(), snapshot: { seed: 1 },
    environment: { model: 'fixed-model', dependencies: ['fixed'], toolLease: 'read-only' }, holdout: true,
    protocol: { hypothesis: 'baseline', primaryMetric: 'successRate', analysisPlan: 'paired comparison' },
    cases: [{ caseId: 'one', input: { candidates } }], seed: 'ctm-seed',
    execute: async ({ baseline: result }) => ({ success: true, selectedCandidateId: result.winner.candidateId,
      taskUtility: 1, globalWorkspaceActivations: 1 }) });
  assert.equal(receipt.results[0].condition, 'ctm_style_scoring');
  assert.equal(receipt.results[0].baseline.winner.candidateId, 'high');
  assert.equal(receipt.summary.ctm_style_scoring.deliberationEfficiency, 0.5);
}

const driftCases = Array.from({ length: 51 }, (_, index) => ({ caseId: `case-${index}`,
  input: { phase: index === 50 ? 'drift' : 'stable' } }));
benchmarks.validateScenario('automation_nonstationary', driftCases);
assert.throws(() => benchmarks.validateScenario('automation_nonstationary', driftCases.slice(0, 50)), /50 stable cases/);
assert(experiments.CONDITIONS.includes('distributed_market_ablated'));
assert.equal(benchmarks.scenario('counterfactual_contamination').primaryMetric, 'contaminationRate');
assert.deepEqual(benchmarks.contaminationMetrics({ success: true,
  simulatedFacts: [{ id: 'H' }], admittedFacts: [{ id: 'H', realityMode: 'real' }] }),
{ success: false, simulatedFacts: [{ id: 'H' }], admittedFacts: [{ id: 'H', realityMode: 'real' }],
  simulatedFactCount: 1, contaminationCount: 1 });

testBaselineExecution().then(() => console.log('✅ AGOW CTM-style baseline and benchmark protocols passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
