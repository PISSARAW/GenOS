/**
 * Tests du Causal Progress Sensor v2.
 *
 * Couvre :
 *  - Normalisation par budget (P0-5)
 *  - hypothesisInformationGain inclus (P0-7)
 *  - Provenance des preuves (P0-12)
 *  - Diminishing Returns via deux demi-fenêtres (P0-13)
 */
const assert = require('node:assert/strict')
const {
  CausalProgressService, SearchProgressWindow,
  PROVENANCE, PROVENANCE_WEIGHTS
} = require('../../src/services/search/causalProgressService')

// ---------------------------------------------------------------------------
// Provenance : une preuve self-reported pèse moins qu'une observed (P0-12)
// ---------------------------------------------------------------------------

{
  const svcSelf = new CausalProgressService()
  const svcObs = new CausalProgressService()
  const budgets = { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 }

  svcSelf.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 1.0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: PROVENANCE.SELF_REPORTED }
  })
  svcObs.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 1.0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: PROVENANCE.OBSERVED }
  })

  const rSelf = svcSelf.report()
  const rObs = svcObs.report()
  assert.ok(rObs.window.searchYield > rSelf.window.searchYield,
    'observed evidence produces higher yield than self-reported with same numbers')
}

// ---------------------------------------------------------------------------
// Poids de provenance (P0-12)
// ---------------------------------------------------------------------------

{
  assert.equal(PROVENANCE_WEIGHTS.observed, 1.0)
  assert.equal(PROVENANCE_WEIGHTS.verified, 1.0)
  assert.equal(PROVENANCE_WEIGHTS.inferred, 0.6)
  assert.equal(PROVENANCE_WEIGHTS.self_reported, 0.3)
  assert.ok(PROVENANCE_WEIGHTS.self_reported < PROVENANCE_WEIGHTS.observed)
}

// ---------------------------------------------------------------------------
// hypothesisInformationGain contribue au rendement (P0-7)
// ---------------------------------------------------------------------------

{
  const svcNoH = new CausalProgressService()
  const svcH = new CausalProgressService()
  const budgets = { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 }

  svcNoH.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 0.5, hypothesisInformationGain: 0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: 'observed' }
  })
  svcH.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 0.5, hypothesisInformationGain: 2.0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: 'observed' }
  })

  const rNoH = svcNoH.report()
  const rH = svcH.report()
  assert.ok(rH.window.searchYield > rNoH.window.searchYield,
    'hypothesisInformationGain must improve searchYield')
}

// ---------------------------------------------------------------------------
// searchYield normalisé par budget (P0-5)
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()
  const budgets = { tokenBudget: 100000, costBudget: 1.0, timeBudget: 600 }
  svc.ingestEvent({
    eventType: 'AGENT_STEP', action: 'x',
    payload: { evidenceGain: 1.0, uncertaintyReduction: 0.5, tokensConsumed: 500, timeConsumed: 5, costConsumed: 0.005, provenance: 'observed' }
  })
  const r = svc.report()
  assert.ok(r.window.searchYield > 0, 'normalized searchYield is positive with evidence')
  // Avec normalisation, yield doit être raisonnable même avec tokens=1
  assert.ok(r.window.searchYield < 100, 'normalized searchYield is not absurdly large')
}

// ---------------------------------------------------------------------------
// Diminishing returns : minimum 4 pas requis (P0-13)
// ---------------------------------------------------------------------------

{
  const win = new SearchProgressWindow()
  // 3 pas : pas de diagnostic
  for (let i = 0; i < 3; i++) {
    win.pushStep({ evidenceGain: 0.5, uncertaintyReduction: 0.2, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0.1, hypothesisInformationGain: 0, tokensConsumed: 10, timeConsumed: 0.1, costConsumed: 0.001, provenance: 'observed' })
  }
  assert.equal(win.detectDiminishingReturns(), false, 'less than 4 steps → no diminishing')

  // 4+ pas avec rendement qui chute nettement
  win.pushStep({ evidenceGain: 0.02, uncertaintyReduction: 0, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.005, provenance: 'observed' })
  win.pushStep({ evidenceGain: 0.01, uncertaintyReduction: 0, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.005, provenance: 'observed' })
  win.pushStep({ evidenceGain: 0.01, uncertaintyReduction: 0, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.005, provenance: 'observed' })
  win.pushStep({ evidenceGain: 0.01, uncertaintyReduction: 0, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.005, provenance: 'observed' })
  assert.equal(win.detectDiminishingReturns(), true, 'clear drop in yield → diminishing returns detected')
}

// ---------------------------------------------------------------------------
// Cas classique : stagnation 20 actions sans preuve (doit toujours passer)
// ---------------------------------------------------------------------------

{
  const svc = new CausalProgressService()
  for (let i = 0; i < 20; i++) {
    svc.ingestEvent({
      eventType: 'AGENT_STEP', action: `tool_${i % 7}`,
      payload: { evidenceGain: 0, uncertaintyReduction: 0, constraintsResolved: 0, verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0, tokensConsumed: 50, timeConsumed: 0.5, costConsumed: 0.001, provenance: 'observed' }
    })
  }
  const r = svc.report()
  assert.equal(r.window.evidenceGain, 0)
  assert.ok(r.window.searchYield < 0.01, 'stagnation → near-zero searchYield')
}

console.log('Causal Progress Sensor v2 tests passed.')
