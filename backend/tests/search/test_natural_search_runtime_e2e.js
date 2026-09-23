/**
 * E2E test with real SQLite and real event structure.
 */

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { SearchPersistence } = require('../../src/services/search/searchPersistenceService');
const { HypothesisLedger, PROVENANCE } = require('../../src/services/search/hypothesisLedgerService');
const { CausalProgressService } = require('../../src/services/search/causalProgressService');
const { NaturalSearchController, SEARCH_PROCESS } = require('../../src/services/search/naturalSearchController');
const { NaturalSearchActuator } = require('../../src/services/search/naturalSearchActuatorService');

async function runRuntimeE2ETest() {
  console.log('=== Natural Search Runtime E2E Test ===');

  const db = await open({ filename: ':memory:', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);

  const persistence = new SearchPersistence(db);
  await persistence.initTables();

  const agentId = 'test-agent-e2e';
  await db.run('INSERT INTO agents (id, name, status) VALUES (?, ?, ?)', [agentId, 'Test Agent', 'active']);

  const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 });
  const controller = new NaturalSearchController({ ledger });
  const actuator = new NaturalSearchActuator();

  const now = Date.now();

  const hCache = ledger.propose({
    agentId,
    statement: 'Cache invalidation causes stale responses'
  });
  ledger.startTest(hCache.id);
  await persistence.saveHypothesis(ledger.hypotheses.get(hCache.id));

  const causalProgress = new CausalProgressService({
    budgets: { tokenBudget: 10000, costBudget: 1.0, timeBudget: 600 }
  });

  for (let i = 0; i < 10; i++) {
    causalProgress.ingestEvent({
      eventType: 'AGENT_STEP',
      action: `tool_${i % 5}`,
      payload: {
        evidenceGain: 0, uncertaintyReduction: 0, constraintsResolved: 0,
        verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0,
        tokensConsumed: 500, timeConsumed: 0.5, costConsumed: 0.001,
        provenance: PROVENANCE.OBSERVED
      }
    });
  }

  for (let i = 0; i < 4; i++) {
    await ledger.addEvidence(hCache.id, {
      direction: 'for', strength: 0.3, provenance: PROVENANCE.OBSERVED,
      reliability: 0.6, independent: true
    });
    const proof = Array.from(ledger.proofs.values()).pop();
    await persistence.saveProof(proof);
  }

  hCache.lastTestedAt = now - 30_000;
  hCache.lastProgressAt = now - 180_000;
  ledger.hypotheses.set(hCache.id, hCache);
  await persistence.saveHypothesis(hCache);

  const causalReport = causalProgress.report();
  const searchYield = causalReport.window.searchYield || 0;

  const ctx = {
    agentId,
    searchYield,
    stepsSinceProgress: 10,
    falsifiedHypotheses: 0,
    contradictions: 0,
    activeHypothesesCount: ledger.activeHypotheses().length,
    budgetRatio: 0.3,
    causalProgressReport: causalReport,
    entropyMetrics: { normalizedEntropy: 0.55 }
  };

  let selection = controller.selectProcess(ctx);
  console.log(`Selection 1: ${selection.process} (classification: ${selection.classification})`);
  assert.equal(selection.classification, 'HYPOTHESIS_LOCK_IN', 'Controller detects lock-in via Ledger');
  await persistence.saveDecision(agentId, { ...selection, searchYield, stepsSinceProgress: 10 });

  const highPressureCtx = {
    ...ctx,
    falsifiedHypotheses: 1,
    contradictions: 1,
    budgetRatio: 0.9
  };
  for (let i = 0; i < 5; i++) {
    selection = controller.selectProcess(highPressureCtx);
  }
  console.log(`Final selection: ${selection.process} (pressure: ${selection.pressure.toFixed(3)})`);
  assert.equal(selection.process, SEARCH_PROCESS.STRESS_HYPERMUTATION, 'STRESS_HYPERMUTATION selected on high pressure + lock-in');
  await persistence.saveDecision(agentId, { ...selection, searchYield, stepsSinceProgress: 10 });

  const receipt = await actuator.execute(selection.process, {
    agentId,
    lockInHypothesis: { hypothesisId: hCache.id },
    lastKnownGood: `checkpoint_${agentId}`,
    topology: 'isolated',
    tools: ['grep', 'test']
  });

  console.log(`Actuator receipt: ${receipt.action} (${receipt.status})`);
  assert.equal(receipt.status, 'success', 'Actuator executed successfully');

  const savedHyp = await persistence.loadHypothesesForAgent(agentId);
  assert.equal(savedHyp.length, 1, 'Hypothesis persisted');

  const savedProofs = await persistence.loadProofsForHypothesis(hCache.id);
  assert.ok(savedProofs.length >= 4, 'Proofs persisted');

  const savedDecisions = await persistence.loadRecentDecisions(agentId);
  assert.ok(savedDecisions.length >= 2, 'Decisions persisted');

  await persistence.savePressureState(agentId, {
    pressure: selection.pressure, confidence: selection.pressure,
    causes: [], recommendedRadius: 'local', stepCount: 10, lastProgressStep: 0
  });
  const savedPressure = await persistence.loadPressureState(agentId);
  assert.ok(savedPressure, 'Pressure state persisted');

  console.log('\n=== Runtime E2E Test PASSED ===');
  await db.close();
}

runRuntimeE2ETest().catch(err => {
  console.error('Runtime E2E Test FAILED:', err.message);
  process.exit(1);
});
