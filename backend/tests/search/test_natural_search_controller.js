const assert = require('node:assert/strict');
const {
  NaturalSearchController,
  SEARCH_PROCESS,
  PHASE_ENTER,
  PHASE_EXIT,
  MIN_DWELL_STEPS
} = require('../../src/services/search/naturalSearchController');
const { CausalProgressService } = require('../../src/services/search/causalProgressService');
const { HypothesisLedger, PROVENANCE } = require('../../src/services/search/hypothesisLedgerService');

function makeCtx(overrides = {}) {
  const svc = new CausalProgressService({ budgets: { tokenBudget: 1000, costBudget: 1.0, timeBudget: 600 } });
  svc.ingestEvent({
    eventType: 'AGENT_STEP', action: 'p',
    payload: { evidenceGain: 0, tokensConsumed: 100, timeConsumed: 1, costConsumed: 0.01, provenance: 'observed' }
  });
  return {
    agentId: 'a', searchYield: 0, stepsSinceProgress: 0, falsifiedHypotheses: 0,
    contradictions: 0, activeHypothesesCount: 1, budgetRatio: 0.3,
    causalProgressReport: svc.report(), entropyMetrics: { normalizedEntropy: 0.3 },
    ...overrides
  };
}

// --- Tests seuils d'entrée (contexte stable, convergence pression naturelle) ---

{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 6; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 8, budgetRatio: 0.8 }));
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE, 'doit entrer en PLASTICITE');
}

{
  const ctrl = new NaturalSearchController();
  const origUpdate = ctrl.pressureModel.update.bind(ctrl.pressureModel);
  ctrl.pressureModel._force = null;
  ctrl.pressureModel.update = function (inputs) {
    const out = origUpdate(inputs);
    if (this._force !== null && this._force !== undefined) out.pressure = this._force;
    return out;
  };
  const base = {
    agentId: 'a', searchYield: 0.15, stepsSinceProgress: 2,
    falsifiedHypotheses: 0, contradictions: 0, budgetRatio: 0.3,
    causalProgressReport: { window: { searchYield: 0.15 } },
    entropyMetrics: {}
  };

  ctrl.pressureModel._force = 0.46;
  let sel = ctrl.selectProcess(base);
  assert.equal(sel.process, SEARCH_PROCESS.PLASTICITE, 'doit entrer en PLASTICITE');

  ctrl.pressureModel._force = 0.70;
  for (let i = 0; i < 5; i++) sel = ctrl.selectProcess(base);
  assert.equal(sel.process, SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH, 'doit monter en CLONAL quand p >= 0.65');
}

{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 6; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 20, budgetRatio: 0.95, falsifiedHypotheses: 2, contradictions: 2 }));
  assert.equal(sel.process, SEARCH_PROCESS.STRESS_HYPERMUTATION);
}

{
  const ctrl = new NaturalSearchController();
  let sel;
  for (let i = 0; i < 8; i++) sel = ctrl.selectProcess(makeCtx({ searchYield: 0, stepsSinceProgress: 25, budgetRatio: 0.98, falsifiedHypotheses: 3, contradictions: 3 }));
  assert.equal(sel.process, SEARCH_PROCESS.SPECIATION);
}

// --- Test hystérésis (mock de pression) ---
{
  const ctrl = new NaturalSearchController();
  const origUpdate = ctrl.pressureModel.update.bind(ctrl.pressureModel);
  ctrl.pressureModel._force = null;
  ctrl.pressureModel.update = function (inputs) {
    const out = origUpdate(inputs);
    if (this._force !== null && this._force !== undefined) out.pressure = this._force;
    return out;
  };
  const base = {
    agentId: 'a', searchYield: 0.15, stepsSinceProgress: 2,
    falsifiedHypotheses: 0, contradictions: 0, budgetRatio: 0.3,
    causalProgressReport: { window: { searchYield: 0.15 } },
    entropyMetrics: {}
  };

  // 1) p=0.46 → entrée PLASTICITE
  ctrl.pressureModel._force = 0.46;
  let r = ctrl.selectProcess(base);
  assert.equal(r.process, SEARCH_PROCESS.PLASTICITE, 'entrée PLASTICITE à p=0.46');

  // 2) p=0.44 → hold PLASTICITE (0.44 < enter 0.45 mais > exit 0.32, dwell=0)
  // Le hold est car le seuil de sortie (0.32) n'est pas franchi
  ctrl.pressureModel._force = 0.44;
  r = ctrl.selectProcess(base);
  assert.equal(r.process, SEARCH_PROCESS.PLASTICITE, 'hold PLASTICITE (p > exit 0.32)');
  assert.ok(r.diagnostics.reason && r.diagnostics.reason.includes('hysteresis'), 'diagnostic hold à p=0.44');

  // 3) p=0.46 → hold PLASTICITE (rebond, toujours > exit 0.32)
  ctrl.pressureModel._force = 0.46;
  r = ctrl.selectProcess(base);
  assert.equal(r.process, SEARCH_PROCESS.PLASTICITE, 'hold PLASTICITE (rebond)');
  // Pas de diagnostic hold car desired == lastProcess (pas de downgrade tenté)

  // 4) p=0.30 avec dwell=3 → sortie (p < exit 0.32 + dwell >= 3)
  ctrl.pressureModel._force = 0.30;
  ctrl.stepsSinceChange = MIN_DWELL_STEPS;
  r = ctrl.selectProcess(base);
  assert.notEqual(r.process, SEARCH_PROCESS.PLASTICITE, 'sortie PLASTICITE quand p < exit + dwell');
}

// --- Ledger lock-in ---
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

console.log('Natural Search Controller v5 tests passed.');
