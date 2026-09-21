const assert = require('node:assert/strict')
const {
  HypothesisLedger, HYPOTHESIS_STATUS, PROVENANCE
} = require('../../src/services/search/hypothesisLedgerService')

function createLedger() {
  const events = []
  const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 })
  ledger.onEvent(e => events.push(e))
  return { ledger, events }
}

// P0-4 : tiny evidence with prior (1,1) should not push confidence near 1
{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'a1', statement: 'H' })
  ledger.startTest(h.id)
  ledger.addEvidence(h.id, { direction: 'for', strength: 0.001, provenance: PROVENANCE.OBSERVED })
  const h2 = ledger.hypotheses.get(h.id)
  assert.ok(h2.confidence < 0.95, 'tiny evidence should not push confidence near 1')
}

// P0-4 : multiple strong evidence reaches supported confidence
{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'a1', statement: 'H' })
  ledger.startTest(h.id)
  for (let i = 0; i < 10; i++) {
    ledger.addEvidence(h.id, { direction: 'for', strength: 0.5, provenance: PROVENANCE.OBSERVED, reliability: 1.0, independent: true })
  }
  const h2 = ledger.hypotheses.get(h.id)
  assert.ok(h2.confidence > 0.7, '10×0.5 strong evidence should reach supported confidence')
  assert.equal(h2.status, HYPOTHESIS_STATUS.SUPPORTED)
}

// P0-5 : uncertainty drops when confidence approaches 1
{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'a1', statement: 'H' })
  const uInitial = h.uncertainty
  ledger.addEvidence(h.id, { direction: 'for', strength: 5, provenance: PROVENANCE.OBSERVED })
  const h2 = ledger.hypotheses.get(h.id)
  assert.ok(h2.uncertainty < uInitial, 'strong evidence should reduce uncertainty')
}

// P0-14 : proofs are structured objects
{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'a1', statement: 'H' })
  ledger.startTest(h.id)
  const result = ledger.addEvidence(h.id, {
    direction: 'for', strength: 1, provenance: PROVENANCE.OBSERVED,
    reliability: 0.9, independent: true, evidenceRef: 'test://E1', receiptRef: 'receipt://R1'
  })
  assert.equal(result.proofIds.length, 1)
  const proof = ledger.proofs.get(result.proofIds[0])
  assert.equal(proof.strength, 1)
  assert.equal(proof.provenance, 'observed')
  assert.equal(proof.reliability, 0.9)
  assert.equal(proof.independent, true)
  assert.equal(proof.evidenceRef, 'test://E1')
}

// P0-15 : FALSIFIED rejects addEvidence
{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'a1', statement: 'H' })
  ledger.startTest(h.id)
  ledger.falsify(h.id)
  const before = ledger.hypotheses.get(h.id).proofIds.length
  ledger.addEvidence(h.id, { direction: 'for', strength: 10 })
  const after = ledger.hypotheses.get(h.id).proofIds.length
  assert.equal(before, after, 'addEvidence must be rejected on FALSIFIED')
}

// P0-15 : FALSIFIED → REOPEN_REQUESTED → REOPENED
{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'a1', statement: 'H' })
  ledger.startTest(h.id)
  ledger.falsify(h.id)
  const reopenReq = ledger.requestReopen(h.id)
  assert.equal(reopenReq.status, HYPOTHESIS_STATUS.REOPEN_REQUESTED)
  const reopened = ledger.reopen(h.id)
  assert.equal(reopened.status, HYPOTHESIS_STATUS.ACTIVE)
}

// detectLockIn via Ledger
{
  const { ledger } = createLedger()
  const now = Date.now()
  const h = ledger.propose({ agentId: 'a1', statement: 'Lock-in' })
  h.status = HYPOTHESIS_STATUS.ACTIVE
  h.lastTestedAt = now - 30_000
  h.lastProgressAt = now - 180_000
  h.confidence = 0.6
  for (let i = 0; i < 3; i++) {
    ledger.addEvidence(h.id, { direction: 'for', strength: 0.5 })
  }
  ledger.hypotheses.set(h.id, h)
  const lockIns = ledger.detectLockIn(now)
  assert.equal(lockIns.length, 1, 'lock-in detected via Ledger')
}

console.log('Hypothesis Ledger v3 tests passed.')
