/**
 * Tests du Hypothesis Ledger (Phase 3).
 *
 * Invariant :
 *  - Une hypothèse falsifiée ne peut pas recevoir > 80 % du budget sans nouvelle preuve.
 *  - Un hypothèse testée récemment mais sans progrès → HYPOTHESIS_LOCK_IN.
 */
const assert = require('node:assert/strict')
const {
  HypothesisLedger,
  Hypothesis,
  HYPOTHESIS_STATUS
} = require('../../src/services/search/hypothesisLedgerService')

// Création d'un ledger avec listeners spies
function createLedger() {
  const events = []
  const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 })
  ledger.onEvent(e => events.push(e))
  return { ledger, events }
}

// ---------------------------------------------------------------------------
// Proposer une hypothèse
// ---------------------------------------------------------------------------

{
  const { ledger, events } = createLedger()
  const h = ledger.propose({
    agentId: 'agent-1',
    statement: 'Cache invalidation is causing stale responses.',
    prediction: 'Disabling cache should eliminate reproduction.',
    falsificationCondition: 'Bug persists with cache completely bypassed.'
  })

  assert.ok(h.id, 'hypothesis has id')
  assert.equal(h.status, HYPOTHESIS_STATUS.PROPOSED)
  assert.equal(h.confidence, 0.5)
  assert.equal(events.some(e => e.type === 'HYPOTHESIS_PROPOSED'), true, 'proposed event emitted')
}

// ---------------------------------------------------------------------------
// Test démarré → status ACTIVE
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'Test' })
  const h2 = ledger.startTest(h.id)

  assert.equal(h2.status, HYPOTHESIS_STATUS.ACTIVE)
  assert.ok(h2.lastTestedAt, 'lastTestedAt set')
}

// ---------------------------------------------------------------------------
// Ajout de preuve → transition de confiance
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'Test', confidence: 0.5 })
  ledger.startTest(h.id)

  // Ajouter preuve for modérée
  ledger.addEvidence(h.id, 'for', 0.3)
  const confidenceAfterFor = ledger.hypotheses.get(h.id).confidence

  assert.ok(confidenceAfterFor > 0.4, 'confidence increases with evidence for')

  // Ajouter preuve against massive
  ledger.addEvidence(h.id, 'against', 2.0)
  const confidenceAfterAgainst = ledger.hypotheses.get(h.id).confidence

  assert.ok(confidenceAfterAgainst < confidenceAfterFor, 'confidence drops with heavy evidence against')
}

// ---------------------------------------------------------------------------
// Affaiblissement
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'Test', confidence: 0.4 })
  ledger.startTest(h.id)
  ledger.addEvidence(h.id, 'against', 1.0)
  const h2 = ledger.hypotheses.get(h.id)

  assert.equal(h2.status, HYPOTHESIS_STATUS.WEAKENED)
}

// ---------------------------------------------------------------------------
// Falsification
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'Test' })
  const falsified = ledger.falsify(h.id)

  assert.equal(falsified.status, HYPOTHESIS_STATUS.FALSIFIED)
  assert.equal(falsified.confidence, 0)
}

// ---------------------------------------------------------------------------
// Détection de HYPOTHESIS_LOCK_IN
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const now = Date.now()

  // Hypothèse active testée il y a 30s, sans progrès depuis 3 min
  const h = new Hypothesis({
    agentId: 'agent-1',
    statement: 'Lock-in case',
    status: HYPOTHESIS_STATUS.ACTIVE,
    lastTestedAt: now - 30_000,
    lastProgressAt: now - 180_000
  })
  ledger.hypotheses.set(h.id, h)

  const lockIns = ledger.detectLockIn(now)
  assert.equal(lockIns.length, 1)
  assert.equal(lockIns[0].hypothesisId, h.id)
  assert.equal(lockIns[0].statement, 'Lock-in case')
}

// ---------------------------------------------------------------------------
// Pas de lock-in si l'hypothesis a produit du progrès récemment
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const now = Date.now()

  const h = new Hypothesis({
    agentId: 'agent-1',
    statement: 'Still progressing',
    status: HYPOTHESIS_STATUS.ACTIVE,
    lastTestedAt: now - 5 * 60_000,
    lastProgressAt: now - 30_000 // progrès récent
  })
  ledger.hypotheses.set(h.id, h)

  const lockIns = ledger.detectLockIn(now)
  assert.equal(lockIns.length, 0, 'no lock-in when progress is recent')
}

// ---------------------------------------------------------------------------
// Vérification de violation de budget avec hypothèse falsifiée
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'Falsified hypothesis' })
  ledger.falsify(h.id)

  // L'agent tente d'allouer 90 % du budget à une hypothèse falsifiée
  const violation = ledger.checkFalsifiedBudgetViolation(h.id, 0.9)

  assert.ok(violation, 'violation detected when budget > 80% for falsified hypothesis')
  assert.equal(violation.violation, true)
  assert.equal(violation.budgetRatio, 0.9)
  assert.equal(violation.threshold, 0.8)
}

// ---------------------------------------------------------------------------
// Pas de violation si budget < seuil
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h = ledger.propose({ agentId: 'agent-1', statement: 'Falsified hypothesis' })
  ledger.falsify(h.id)

  const violation = ledger.checkFalsifiedBudgetViolation(h.id, 0.5)
  assert.equal(violation, null, 'no violation when budget below threshold')
}

// ---------------------------------------------------------------------------
// Hypothèses actives / filtrage par agent
// ---------------------------------------------------------------------------

{
  const { ledger } = createLedger()
  const h1 = ledger.propose({ agentId: 'agent-1', statement: 'A' })
  const h2 = ledger.propose({ agentId: 'agent-1', statement: 'B' })
  ledger.propose({ agentId: 'agent-2', statement: 'C' })

  ledger.startTest(h1.id)
  ledger.startTest(h2.id)

  const active = ledger.activeHypotheses()
  assert.ok(active.length >= 2, 'at least 2 active hypotheses')

  const agent1 = ledger.hypothesesForAgent('agent-1')
  assert.equal(agent1.length, 2, 'agent-1 has 2 hypotheses')
}

console.log('Hypothesis Ledger tests passed.')
