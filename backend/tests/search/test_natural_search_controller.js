/**
 * Tests du Natural Search Controller v3.
 */
const assert = require('node:assert/strict')
const {
  NaturalSearchController,
  SEARCH_PROCESS
} = require('../../src/services/search/naturalSearchController')
const { CausalProgressService } = require('../../src/services/search/causalProgressService')

function makeCtx(overrides = {}) {
  const svc = new CausalProgressService()
  svc.ingestEvent({
    eventType: 'AGENT_STEP', action: 'probe',
    payload: overrides.causal || {
      evidenceGain: 0.1, uncertaintyReduction: 0.05, constraintsResolved: 0,
      verifiedArtifactDelta: 0, objectiveDelta: 0.01, hypothesisInformationGain: 0,
      tokensConsumed: 10, timeConsumed: 0.1, costConsumed: 0.001, provenance: 'observed'
    }
  })
  return {
    agentId: 'agent-test', searchYield: 0.1, stepsSinceProgress: 0,
    falsifiedHypotheses: 0, contradictions: 0, activeHypothesesCount: 1,
    budgetRatio: 0.3, causalProgressReport: svc.report(),
    entropyMetrics: { normalizedEntropy: 0.3 }, ...overrides
  }
}

// Continue (low pressure)
{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({ searchYield: 0.5, stepsSinceProgress: 0 }))
  assert.equal(sel.process, SEARCH_PROCESS.CONTINUE)
}

// Forage (low marginal yield with stagnation)
{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({ searchYield: 0.01, stepsSinceProgress: 3 }))
  assert.equal(sel.process, SEARCH_PROCESS.FORAGE)
}

// Plasticité (moderate pressure with contradictions)
{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({
    searchYield: 0, stepsSinceProgress: 20, budgetRatio: 0.9,
    falsifiedHypotheses: 1, contradictions: 1,
    entropyMetrics: { normalizedEntropy: 0.55 }
  }))
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE)
}

// Clonal affinity search (3 iterations to accumulate pressure in clonal range)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 3; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 20, budgetRatio: 0.95,
      entropyMetrics: { normalizedEntropy: 0.55 }
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH)
}

// Replay causal (falsified hypothesis in clonal range)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 2; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 20, budgetRatio: 0.95,
      falsifiedHypotheses: 1, entropyMetrics: { normalizedEntropy: 0.55 }
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.REPLAY_CAUSAL)
}

// Stress hypermutation (very high pressure)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 4; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 25, budgetRatio: 0.95,
      falsifiedHypotheses: 2, contradictions: 2,
      entropyMetrics: { normalizedEntropy: 0.55 }
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.STRESS_HYPERMUTATION)
}

// Speciation (extreme pressure with 3+ falsifications)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 4; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 25, budgetRatio: 0.98,
      falsifiedHypotheses: 3, contradictions: 3,
      entropyMetrics: { normalizedEntropy: 0.55 }
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.SPECIATION)
}

// Historique
{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx())
  ctrl.recordSelection(sel)
  assert.equal(ctrl.getHistory().length, 1)
}

console.log('Natural Search Controller v3 tests passed.')
