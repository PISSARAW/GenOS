'use strict';

const assert = require('node:assert/strict');
const scheduler = require('../src/services/daemon/scheduling/computeScheduler');

async function main() {
  // 1. U(a) : gain × pertinence × urgence / coûts.
  assert.equal(scheduler.actionUtility({ expectedInfoGain: 0.8, relevance: 0.9, urgency: 0.5, computeCost: 0.9, interferenceCost: 0 }), 0.4);
  assert.equal(scheduler.actionUtility({ expectedInfoGain: 0, relevance: 1, urgency: 1, computeCost: 1, interferenceCost: 0 }), 0);
  assert.equal(scheduler.actionUtility(null), 0);

  // 2. LLM seulement sur pression : utilité haute + budget → oui.
  const allow = scheduler.llmAllowed({
    pressures: { llmRequest: { expectedInfoGain: 0.9, relevance: 0.9, urgency: 0.8, computeCost: 1, interferenceCost: 0.5 } },
    budget: { wakesLeft: 3 }
  });
  assert.equal(allow.allowed, true);

  // 3. Utilité basse → non ; budget épuisé → non ; machine stressée → différé.
  const weak = { expectedInfoGain: 0.1, relevance: 0.2, urgency: 0.1, computeCost: 2, interferenceCost: 1 };
  assert.equal(scheduler.llmAllowed({ pressures: { llmRequest: weak }, budget: { wakesLeft: 5 } }).allowed, false);
  const rich = { expectedInfoGain: 0.9, relevance: 0.9, urgency: 0.9, computeCost: 0.5, interferenceCost: 0 };
  assert.equal(scheduler.llmAllowed({ pressures: { llmRequest: rich }, budget: { wakesLeft: 0 } }).reason, 'wake-budget-exhausted');
  assert.equal(scheduler.llmAllowed({ pressures: { llmRequest: rich, deferReasoning: true }, budget: { wakesLeft: 5 } }).reason, 'machine-stressed-defer');

  // 4. Plan de cycle : sensing toujours, graphe sur pression, LLM gaté, consolidation en DORMANT.
  const plan = scheduler.planCycle({
    activity: 'DORMANT',
    pressures: { cartographyPressure: 0.8, wakeUrgency: 0.6, llmRequest: rich },
    budget: { wakesLeft: 4 }
  });
  assert.equal(plan.planned, true);
  const actions = {};
  plan.plan.forEach((p) => { actions[p.action] = p; });
  assert.equal(actions['cheap-sensing'].gated, false);
  assert.ok(actions['incremental-graph-update'], 'graph update on pressure');
  assert.ok(actions['static-checks'], 'static checks on urgency');
  assert.equal(actions['llm-reasoning'].allowed, true);
  assert.ok(actions['memory-consolidation'], 'consolidation while dormant');

  // 5. Territoire calme : pas de graphe, pas de replay, LLM refusé.
  const calm = scheduler.planCycle({ activity: 'FOCUSED', pressures: { cartographyPressure: 0.1, wakeUrgency: 0 }, budget: { wakesLeft: 4 } });
  assert.ok(!calm.plan.find((p) => p.action === 'incremental-graph-update'));
  assert.ok(!calm.plan.find((p) => p.action === 'deep-causal-replay'));

  // 6. Idle + haute valeur → deep replay autorisé.
  const idle = scheduler.planCycle({ activity: 'DORMANT', pressures: { wakeUrgency: 0.1, valueEstimate: 0.9 }, budget: { wakesLeft: 4 } });
  assert.ok(idle.plan.find((p) => p.action === 'deep-causal-replay'));

  assert.equal(scheduler.planCycle(null).planned, false);
  console.log('Daemon scheduler tests passed (U(a) utility, gated LLM, metabolic plan).');
}

main().catch((error) => { console.error(error); process.exit(1); });
