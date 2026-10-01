'use strict';

const experiments = require('../agowExperimentService');

const SCENARIOS = Object.freeze({
  ctm_compatible: { conditions: ['full', 'ctm_style_scoring'], primaryMetric: 'successRate',
    hypothesis: 'AGOW remains competitive with processor self-rating under matched resources.' },
  genos_differential: { conditions: ['full', 'provenance_ablated', 'allostasis_ablated', 'counterfactual_ablated', 'proceduralization_ablated', 'decompilation_ablated', 'distributed_market_ablated'], primaryMetric: 'successRate',
    hypothesis: 'GenOS-specific mechanisms improve outcomes on self/world, drift and long-horizon tasks.' },
  automation_nonstationary: { conditions: ['full', 'direct_pathway_ablated', 'proceduralization_ablated', 'decompilation_ablated'], primaryMetric: 'deliberationEfficiency',
    hypothesis: 'Repeated tasks reduce deliberation cost without lowering success, and drift triggers decompilation.' },
  predictive_regret: { conditions: ['full', 'regret_ablated', 'allostasis_ablated', 'ctm_style_scoring'], primaryMetric: 'successRate',
    hypothesis: 'Regret arbitration selects high-consequence uncertain evidence when expected ignored loss warrants it.' },
  counterfactual_contamination: { conditions: ['full', 'counterfactual_ablated', 'provenance_ablated'], primaryMetric: 'contaminationRate',
    hypothesis: 'Simulated facts never enter real observation stores without a counterfactual provenance tag.' },
  distributed_market_scale: { conditions: ['full', 'distributed_market_ablated'], primaryMetric: 'meanLatencyMs',
    hypothesis: 'Topology-aware regional competition scales while retaining useful candidates.' }
});

function scenario(name) {
  const definition = SCENARIOS[name];
  if (!definition) throw new TypeError(`Unknown AGOW benchmark scenario: ${name}`);
  return definition;
}

function validateAutomation(cases) {
  if (cases.length < 51) throw new TypeError('Non-stationary automation benchmark requires 50 stable cases and one drift case.');
  if (cases.slice(0, 50).some((item) => item.input?.phase !== 'stable') || cases[50].input?.phase !== 'drift') {
    throw new TypeError('Automation holdout must mark its first 50 cases stable and case 51 drift.');
  }
}

function validateScale(cases) {
  const counts = cases.map((item) => item.input?.candidates?.length);
  if (![10, 50, 100, 500, 1000].every((count) => counts.includes(count))) {
    throw new TypeError('Market scale benchmark requires cases of 10, 50, 100, 500 and 1000 candidates.');
  }
}

function validateScenario(name, cases) {
  if (!Array.isArray(cases) || !cases.length) throw new TypeError('Benchmark requires a non-empty holdout corpus.');
  if (name === 'automation_nonstationary') validateAutomation(cases);
  if (name === 'distributed_market_scale') validateScale(cases);
  if (name === 'counterfactual_contamination' && cases.some((item) => !Array.isArray(item.input?.simulatedFacts))) {
    throw new TypeError('Contamination benchmark cases require simulatedFacts references.');
  }
}

function contaminationMetrics(outcome) {
  const simulated = Array.isArray(outcome.simulatedFacts) ? outcome.simulatedFacts : [];
  const admitted = Array.isArray(outcome.admittedFacts) ? outcome.admittedFacts : [];
  const realIds = new Set(admitted.filter((fact) => fact.realityMode !== 'counterfactual').map((fact) => fact.id));
  const contaminationCount = simulated.filter((fact) => realIds.has(fact.id)).length;
  return { ...outcome, simulatedFactCount: simulated.length, contaminationCount,
    success: outcome.success === true && contaminationCount === 0 };
}

async function executeBenchmarkCase(options) {
  const outcome = await options.execute({ ...options, benchmarkScenario: options.scenario });
  if (options.scenario === 'counterfactual_contamination') return contaminationMetrics(outcome || {});
  return outcome;
}

async function run(options) {
  const definition = scenario(options.scenario);
  validateScenario(options.scenario, options.cases);
  const protocol = { ...options.protocol, hypothesis: options.protocol?.hypothesis || definition.hypothesis,
    primaryMetric: options.protocol?.primaryMetric || definition.primaryMetric,
    analysisPlan: options.protocol?.analysisPlan || `Compare conditions by ${definition.primaryMetric}; retain all case outcomes.` };
  return experiments.run({ ...options, execute: (input) => executeBenchmarkCase({ ...input,
    execute: options.execute, scenario: options.scenario }), kind: `agow_benchmark:${options.scenario}`,
    conditions: definition.conditions, protocol, holdout: true });
}

module.exports = { SCENARIOS, scenario, validateScenario, contaminationMetrics, executeBenchmarkCase, run };
