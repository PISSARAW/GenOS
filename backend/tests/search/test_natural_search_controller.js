const assert = require('node:assert/strict');
const {
  NaturalSearchController,
  SEARCH_PROCESS
} = require('../../src/services/search/naturalSearchController');
const { CausalProgressService } = require('../../src/services/search/causalProgressService');
const { HypothesisLedger, PROVENANCE } = require('../../src/services/search/hypothesisLedgerService');

function makeCtx(overrides = {}) {
  const svc = new CausalProgressService({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } });
  svc.ingestEvent({
    eventType: 'AGENT_STEP', action: 'p',
    payload: { evidenceGain: 0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: 'observed' }
  });
  return { agentId: 'a', searchYield: 0, stepsSinceProgress: 0, falsifiedHypotheses: 0, contradictions: 0, activeHypothesesCount: 1, budgetRatio: 0.3, causalProgressReport: svc.report(), entropyMetrics: { normalizedEntropy: 0.3 }, ...overrides };
}

// Plasticité (need ~5 iters to reach P >= 0.45)
{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 6; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 8, budgetRatio: 0.8 }));
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE);
}

// Clonal affinity search
{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 10; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 10, budgetRatio: 0.85, falsifiedHypotheses: 1 }));
  assert.equal(sel.process, SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH);
}

// Stress hypermutation
{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 6; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 20, budgetRatio: 0.95, falsifiedHypotheses: 2, contradictions: 2 }));
  assert.equal(sel.process, SEARCH_PROCESS.STRESS_HYPERMUTATION);
}

// Speciation
{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 8; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 25, budgetRatio: 0.98, falsifiedHypotheses: 3, contradictions: 3 }));
  assert.equal(sel.process, SEARCH_PROCESS.SPECIATION);
}

// Ledger lock-in
{
  const ledger = new HypothesisLedger();
  const now = Date.now();
  const h = ledger.propose({ agentId: 'a', statement: 'Lock-in' });
  h.status = 'active';
  h.lastTestedAt = now - 30_000;
  h.lastProgressAt = now - 180_000;
  h.confidence = 0.6;
  for (let i = 0; i < 3; i++) ledger.addEvidence(h.id, { direction: 'for', strength: 0.5, provenance: PROVENANCE.OBSERVED });
  ledger.hypotheses.set(h.id, h);
  assert.equal(ledger.detectLockIn(now).length, 1, 'Ledger detects lock-in');
}

console.log('Natural Search Controller v4 tests passed.');
