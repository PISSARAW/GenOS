const assert = require('node:assert/strict')
const {
  NaturalSearchController,
  SEARCH_PROCESS
} = require('../../src/services/search/naturalSearchController')
const { CausalProgressService } = require('../../src/services/search/causalProgressService')
const { HypothesisLedger, PROVENANCE } = require('../../src/services/search/hypothesisLedgerService')

function makeCtx(overrides = {}) {
  const svc = new CausalProgressService({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } })
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

// Forage (low marginal yield)
{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({ searchYield: 0.01, stepsSinceProgress: 3 }))
  assert.equal(sel.process, SEARCH_PROCESS.FORAGE)
}

// Plasticité (moderate pressure: stagnation + some falsifications)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 3; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 10, budgetRatio: 0.85,
      falsifiedHypotheses: 1
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE)
}

// Clonal affinity search (high pressure)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 3; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 20, budgetRatio: 0.95,
      falsifiedHypotheses: 2, contradictions: 1
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH)
}

// Stress hypermutation (very high pressure)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 4; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 25, budgetRatio: 0.95,
      falsifiedHypotheses: 3, contradictions: 2
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.STRESS_HYPERMUTATION)
}

// Speciation (extreme pressure with 3+ falsifications)
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 5; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 25, budgetRatio: 0.98,
      falsifiedHypotheses: 3, contradictions: 3
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.SPECIATION)
}

// Hysteresis: once in PLASTICITY, stays there even if pressure drops slightly
{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 5; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0, stepsSinceProgress: 15, budgetRatio: 0.7,
      falsifiedHypotheses: 1, contradictions: 1
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE, 'reaches plasticity')
  const sel2 = ctrl.selectProcess(makeCtx({
    searchYield: 0, stepsSinceProgress: 5, budgetRatio: 0.5
  }))
  assert.equal(sel2.process, SEARCH_PROCESS.PLASTICITE, 'stays in plasticity due to hysteresis')
}

// Ledger lock-in detection
{
  const ledger = new HypothesisLedger()
  const now = Date.now()
  const h = ledger.propose({ agentId: 'agent-test', statement: 'Lock-in' })
  h.status = 'active'
  h.lastTestedAt = now - 30_000
  h.lastProgressAt = now - 180_000
  h.confidence = 0.6
  for (let i = 0; i < 3; i++) {
    ledger.addEvidence(h.id, { direction: 'for', strength: 0.5, provenance: PROVENANCE.OBSERVED })
  }
  ledger.hypotheses.set(h.id, h)
  const lockIns = ledger.detectLockIn(now)
  assert.equal(lockIns.length, 1, 'Ledger detects lock-in')
}

// Controller accepts Ledger reference
{
  const ledger = new HypothesisLedger()
  const ctrl = new NaturalSearchController({ ledger })
  assert.ok(ctrl.ledger === ledger, 'Controller has Ledger reference')
}

console.log('Natural Search Controller v4 tests passed.')
