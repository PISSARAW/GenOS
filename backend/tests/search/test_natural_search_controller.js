/**
 * Tests du Natural Search Controller (Phase 5).
 *
 * Invariants :
 *  - Pression faible → CONTINUE
 *  - Rendement marginal faible → FORAGE
 *  - Pression modérée → PLASTICITE
 *  - Hypothèse lock-in → REPLAY_CAUSAL
 *  - Pression forte → STRESS_HYPERMUTATION
 *  - Échecs multiples → SPECIATION
 */
const assert = require('node:assert/strict')
const {
  NaturalSearchController,
  SEARCH_PROCESS,
  PHASE_THRESHOLDS
} = require('../../src/services/search/naturalSearchController')
const { CausalProgressService } = require('../../src/services/search/causalProgressService')

function makeCtx(overrides = {}) {
  const svc = new CausalProgressService()
  svc.ingestEvent({
    eventType: 'AGENT_STEP',
    action: 'probe',
    payload: overrides.causal || {
      evidenceGain: 0.1,
      uncertaintyReduction: 0.05,
      constraintsResolved: 0,
      verifiedArtifactDelta: 0,
      objectiveDelta: 0.01,
      hypothesisInformationGain: 0,
      tokensConsumed: 10,
      timeConsumed: 0.1,
      costConsumed: 0.001
    }
  })
  return {
    agentId: 'agent-test',
    searchYield: 0.1,
    stepsSinceProgress: 0,
    falsifiedHypotheses: 0,
    contradictions: 0,
    activeHypothesesCount: 1,
    budgetRatio: 0.3,
    causalProgressReport: svc.report(),
    entropyMetrics: { normalizedEntropy: 0.3 },
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Pression faible → CONTINUE
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({ searchYield: 0.5, stepsSinceProgress: 0 }))
  assert.equal(sel.process, SEARCH_PROCESS.CONTINUE, 'low pressure → CONTINUE')
  assert.ok(sel.pressure < PHASE_THRESHOLDS.HOMEOSTASIS_MAX)
}

// ---------------------------------------------------------------------------
// Rendement marginal faible → FORAGE
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({ searchYield: 0.01, stepsSinceProgress: 1 }))
  assert.equal(sel.process, SEARCH_PROCESS.FORAGE, 'low yield → FORAGE')
}

// ---------------------------------------------------------------------------
// Pression modérée → PLASTICITE
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  // Accumuler de la pression progressivement (searchYield=0.06 juste au-dessus du seuil, steps=4)
  let sel
  for (let i = 0; i < 2; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0.06,
      stepsSinceProgress: 4,
      budgetRatio: 0.45
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE, 'moderate pressure → PLASTICITE')
}

// ---------------------------------------------------------------------------
// Hypothèse lock-in → REPLAY_CAUSAL
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx({
    searchYield: 0.02,
    stepsSinceProgress: 8,
    budgetRatio: 0.6,
    entropyMetrics: { normalizedEntropy: 0.55 }
  }))
  assert.equal(sel.process, SEARCH_PROCESS.REPLAY_CAUSAL, 'lock-in → REPLAY_CAUSAL')
}

// ---------------------------------------------------------------------------
// Pression forte → STRESS_HYPERMUTATION
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 5; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0,
      stepsSinceProgress: 10,
      budgetRatio: 0.85,
      falsifiedHypotheses: 1
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.STRESS_HYPERMUTATION, 'high pressure → STRESS_HYPERMUTATION')
}

// ---------------------------------------------------------------------------
// Échecs multiples → SPECIATION
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  let sel
  for (let i = 0; i < 5; i++) {
    sel = ctrl.selectProcess(makeCtx({
      searchYield: 0,
      stepsSinceProgress: 15,
      budgetRatio: 0.95,
      falsifiedHypotheses: 3,
      contradictions: 2
    }))
  }
  assert.equal(sel.process, SEARCH_PROCESS.SPECIATION, 'multiple failures → SPECIATION')
}

// ---------------------------------------------------------------------------
// Historique des sélections
// ---------------------------------------------------------------------------

{
  const ctrl = new NaturalSearchController()
  const sel = ctrl.selectProcess(makeCtx())
  ctrl.recordSelection(sel)
  assert.equal(ctrl.getHistory().length, 1)
}

console.log('Natural Search Controller tests passed.')
