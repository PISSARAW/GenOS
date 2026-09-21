const assert = require('node:assert/strict')
const {
  NaturalSearchController,
  SEARCH_PROCESS
} = require('../../src/services/search/naturalSearchController')
const {
  NaturalSearchActuator
} = require('../../src/services/search/naturalSearchActuatorService')
const {
  HypothesisLedger,
  PROVENANCE
} = require('../../src/services/search/hypothesisLedgerService')
const {
  CausalProgressService
} = require('../../src/services/search/causalProgressService')

function runE2ETest() {
  console.log('=== Natural Search Control Plane E2E ===')

  const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 })
  const actuator = new NaturalSearchActuator()
  const controller = new NaturalSearchController({ ledger })

  const now = Date.now()

  // 1. Proposer H_cache
  const hCache = ledger.propose({
    agentId: 'agent-1',
    statement: 'Cache invalidation causes stale responses'
  })
  ledger.startTest(hCache.id)

  // 2. 10 actions variées sans preuve
  const svc = new CausalProgressService({
    budgets: { tokenBudget: 10000, costBudget: 1.0, timeBudget: 600 }
  })

  for (let i = 0; i < 10; i++) {
    svc.ingestEvent({
      eventType: 'AGENT_STEP',
      action: `tool_${i % 5}`,
      payload: {
        evidenceGain: 0, uncertaintyReduction: 0, constraintsResolved: 0,
        verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0,
        tokensConsumed: 500, timeConsumed: 0.5, costConsumed: 0.001,
        provenance: PROVENANCE.OBSERVED
      }
    })
  }

  // 3. Preuves pour H_cache
  for (let i = 0; i < 4; i++) {
    ledger.addEvidence(hCache.id, {
      direction: 'for', strength: 0.3, provenance: PROVENANCE.OBSERVED,
      reliability: 0.6, independent: true
    })
  }

  hCache.lastTestedAt = now - 30_000
  hCache.lastProgressAt = now - 180_000
  ledger.hypotheses.set(hCache.id, hCache)

  // 4. Contexte
  const causalReport = svc.report()
  const searchYield = causalReport.window.searchYield

  const ctx = {
    agentId: 'agent-1',
    searchYield: searchYield,
    stepsSinceProgress: 10,
    falsifiedHypotheses: 0,
    contradictions: 0,
    activeHypothesesCount: 1,
    budgetRatio: 0.3,
    causalProgressReport: causalReport,
    entropyMetrics: { normalizedEntropy: 0.55 }
  }

  // 5. Détection du lock-in
  let selection = controller.selectProcess(ctx)
  console.log(`Selection 1: ${selection.process} (pressure: ${selection.pressure.toFixed(3)}, class: ${selection.classification})`)
  assert.equal(selection.classification, 'HYPOTHESIS_LOCK_IN', 'Controller detects lock-in via Ledger')

  // 6. Montée en pression
  const highPressureCtx = {
    ...ctx,
    falsifiedHypotheses: 1,
    contradictions: 1,
    budgetRatio: 0.9
  }
  for (let i = 0; i < 5; i++) {
    selection = controller.selectProcess(highPressureCtx)
  }
  console.log(`Selection final: ${selection.process} (pressure: ${selection.pressure.toFixed(3)})`)
  assert.equal(selection.process, SEARCH_PROCESS.REPLAY_CAUSAL, 'REPLAY_CAUSAL selected on lock-in')

  // 7. Exécution via Actuator
  const receipt = actuator.executeSync(selection.process, {
    agentId: 'agent-1',
    lockInHypothesis: { hypothesisId: hCache.id },
    lastKnownGood: 'checkpoint_before_H_cache',
    topology: 'isolated',
    tools: ['grep', 'test']
  })

  console.log(`Actuator receipt: ${receipt.action} (${receipt.status})`)
  assert.ok(receipt.isSuccess(), 'Actuator executed successfully')
  assert.equal(receipt.process, SEARCH_PROCESS.REPLAY_CAUSAL)

  // 8. Vérification du receipt
  assert.ok(receipt.id, 'Receipt has ID')
  assert.ok(receipt.timestamp, 'Receipt has timestamp')
  assert.ok(receipt.result, 'Receipt has result')

  // 9. Historique
  assert.ok(controller.getHistory().length > 0, 'Controller has history')
  assert.ok(actuator.getReceipts().length > 0, 'Actuator has receipts')

  console.log('\n=== E2E Test PASSED ===')
}

runE2ETest()
