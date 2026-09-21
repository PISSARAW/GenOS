/**
 * Tests du Hypothesis Ledger v2.
 *
 * Couvre :
 *  - P0-4 : confiance bayésienne avec prior (une preuve infinitésime ≠ SUPPORTED)
 *  - P0-5 : incertitude = entropie normalisée
 *  - P0-14 : preuves structurées avec provenance
 *  - P0-15 : transition FALSIFIED → REOPENED explicite uniquement
 */
const assert = require('node:assert/strict')
const {
  HypothesisLedger, Hypothesis, HYPOTHESIS_STATUS
} = require('../../src/services/search/hypothesisLedgerService')

function createLedger() {
  const events = []
  const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8, priorAlpha: 1, priorBeta: 1 })
  ledger.onEvent(e => events.push(e))
  return { ledger, events }
}

// ---------------------------------------------------------------------------
// P0-4 : confiance bayésienne — une preuve infinitésime ne suffit pas
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'H', confidence: 0.5 })
  ledger.startTest(h.id)
  ledger.addEvidence(h.id, 'for', 0.001)
  const h2 = ledger.hypotheses.get(h.id)
  assert.ok(h2.confidence < 0.95, 'tiny evidence with prior (1,1) should not push confidence near 1')
  assert.notEqual(h2.status, HYPOTHESIS_STATUS.SUPPORTED, 'tiny evidence must not make hypothesis SUPPORTED')
}

// ---------------------------------------------------------------------------
// P0-4 : plusieurs preuves fortes → confiance crédible
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'H', confidence: 0.5 })
  ledger.startTest(h.id)
  for (let i = 0; i < 5; i++) ledger.addEvidence(h.id, 'for', 0.5)
  const h2 = ledger.hypotheses.get(h.id)
  assert.ok(h2.confidence > 0.7, '5×0.5 for evidence should reach supported confidence')
  assert.equal(h2.status, HYPOTHESIS_STATUS.SUPPORTED)
}

// ---------------------------------------------------------------------------
// P0-5 : incertitude baisse quand la confiance s'approche de 0 ou 1
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'H', confidence: 0.5 })
  const uInitial = h.uncertainty
  ledger.addEvidence(h.id, 'for', 5)
  const h2 = ledger.hypotheses.get(h.id)
  assert.ok(h2.uncertainty < uInitial, 'strong evidence for should reduce uncertainty')
}

// ---------------------------------------------------------------------------
// P0-15 : FALSIFIED ne peut pas recevoir de addEvidence
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'H' })
  ledger.startTest(h.id)
  ledger.falsify(h.id)
  const before = ledger.hypotheses.get(h.id).evidenceFor
  ledger.addEvidence(h.id, 'for', 10) // doit être rejeté
  const after = ledger.hypotheses.get(h.id).evidenceFor
  assert.equal(before, after, 'addEvidence must be rejected on FALSIFIED hypothesis')
}

// ---------------------------------------------------------------------------
// P0-15 : transition FALSIFIED → REOPEN_REQUESTED → REOPENED
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'H' })
  ledger.startTest(h.id)
  ledger.falsify(h.id)

  const reopenReq = ledger.requestReopen(h.id)
  assert.equal(reopenReq.status, HYPOTHESIS_STATUS.REOPEN_REQUESTED)

  const reopened = ledger.reopen(h.id)
  assert.equal(reopened.status, HYPOTHESIS_STATUS.ACTIVE)
}

// ---------------------------------------------------------------------------
// detectLockIn
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const now = Date.now()
  const h = new Hypothesis({
    agentId: 'agent-1', statement: 'Lock-in case',
    status: HYPOTHESIS_STATUS.ACTIVE,
    lastTestedAt: now - 30_000, lastProgressAt: now - 180_000
  })
  ledger.hypotheses.set(h.id, h)
  const lockIns = ledger.detectLockIn(now)
  assert.equal(lockIns.length, 1)
}

console.log('Hypothesis Ledger v2 tests passed.')
