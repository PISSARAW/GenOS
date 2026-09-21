/**
 * Tests du Causal Progress Sensor v3.
 */
const assert = require('node:assert/strict')
const {
  CausalProgressService, SearchProgressWindow,
  PROVENANCE, PROVENANCE_WEIGHTS
} = require('../../src/services/search/causalProgressService')

// Provenance : poids une seule fois
{
  const svc = new CausalProgressService({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } })
  svc.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 1.0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: PROVENANCE.SELF_REPORTED }
  })
  const r = svc.report()
  // 1.0 * 0.3 = 0.3
  assert.ok(Math.abs(r.window.evidenceGain - 0.3) < 0.01, 'self-reported weight applied once')
}

// hypothesisInformationGain contribue
{
  const svc = new CausalProgressService({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } })
  svc.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 0.5, hypothesisInformationGain: 2.0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: PROVENANCE.OBSERVED }
  })
  const r = svc.report()
  assert.ok(r.window.searchYield > 0, 'yield positive with evidence')
}

// Diminishing returns : minimum 4 pas
{
  const win = new SearchProgressWindow({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } })
  for (let i = 0; i < 3; i++) {
    win.pushStep({ evidenceGain: 0.5, tokensConsumed: 10, timeConsumed: 0.1, costConsumed: 0.001, provenance: PROVENANCE.OBSERVED })
  }
  assert.equal(win.detectDiminishingReturns(), false, 'less than 4 steps → no diminishing')
}

// Stagnation 20 actions
{
  const svc = new CausalProgressService({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } })
  for (let i = 0; i < 20; i++) {
    svc.ingestEvent({
      eventType: 'AGENT_STEP', action: `tool_${i % 7}`,
      payload: { evidenceGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.001, provenance: PROVENANCE.OBSERVED }
    })
  }
  const r = svc.report()
  assert.ok(r.window.searchYield < 0.01, 'stagnation → near-zero yield')
}

console.log('Causal Progress Sensor v3 tests passed.')
