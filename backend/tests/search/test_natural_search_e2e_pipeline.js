/**
 * E2E Test — Point 9 : passe par le vrai point d'entrée du pipeline
 * checkNaturalSearchControl() avec une vraie DB SQLite en mémoire.
 *
 * processEventQueueImpl (le cœur du superviseur) appelle checkNaturalSearchControl
 * à chaque itération de la file d'événements. Ce test injecte un événement
 * AGENT_STEP et appelle checkNaturalSearchControl directement — c'est exactement
 * le code path que processEventQueueImpl exécute à la ligne 191 du pipeline.
 *
 * Vérifie que :
 *   1. Un événement AGENT_STEP arrive au pipeline NS
 *   2. Le controller sélectionne un processus (PLASTICITE, EVOLUTION…)
 *   3. L'actuator exécute une action observable
 *   4. SearchPersistence sauvegarde hypothèse + décision + pression
 *   5. Le ledger détecte un lock-in après accumulation de preuves
 */

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { SearchPersistence } = require('../../src/services/search/searchPersistenceService');
const { HypothesisLedger, PROVENANCE } = require('../../src/services/search/hypothesisLedgerService');
const { CausalProgressService } = require('../../src/services/search/causalProgressService');
const { NaturalSearchController, SEARCH_PROCESS } = require('../../src/services/search/naturalSearchController');
const { NaturalSearchActuator } = require('../../src/services/search/naturalSearchActuatorService');
const { checkNaturalSearchControl } = require('../../src/services/search/naturalSearchRuntime');

// Vérifier que checkNaturalSearchControl est bien exportée du pipeline
const pipeline = require('../../src/services/agentProcessEventPipeline');
assert.equal(typeof pipeline.processEventQueueImpl, 'function', 'processEventQueueImpl is exported from pipeline');
assert.equal(typeof pipeline.checkNaturalSearchControl, 'function', 'checkNaturalSearchControl is re-exported from pipeline');
console.log('[Pre] Pipeline exports verified ✓');

async function runE2ETest() {
  console.log('\n=== Natural Search E2E Test (Point 9 — pipeline) ===');

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

  const agentId = 'e2e-agent-9';
  await db.run('INSERT INTO agents (id, name, status) VALUES (?, ?, ?)', [
    agentId, 'E2E Agent', 'active'
  ]);

  // Contexte similaire à ce que processEventQueueImpl construit pour checkNaturalSearchControl
  const ctx = {
    db,
    agentId,
    normalizedMission: {
      id: 'e2e-mission',
      prompt: 'E2E Natural Search pipeline test',
      executionBudget: { tokens: 100000, costUsd: 1.0, timeSec: 600 }
    },
    dispatchedAgent: { id: agentId, name: 'E2E Agent', execution_mode: 'orchestrator' },
    contractRecord: { id: 'contract-e2e', version: '1.0.0' },
    executionRun: { id: 'run-e2e' },
    state: {
      eventQueue: [],
      isProcessingEvents: false,
      termination: false,
      terminalEventSeen: false,
      executionQueue: Promise.resolve()
    },
    emitTracked: function () {},
    haltRuntime: function () { this.state.termination = true; }
  };

  const event = {
    eventType: 'AGENT_STEP',
    action: 'e2e_step',
    detail: 'E2E pipeline test event',
    severity: 'info',
    agentId,
    payload: {
      evidenceGain: 0.5,
      uncertaintyReduction: 0.3,
      constraintsResolved: 1,
      verifiedArtifactDelta: 1,
      objectiveDelta: 0.1,
      hypothesisInformationGain: 1.5,
      tokensConsumed: 200,
      timeConsumed: 0.2,
      costConsumed: 0.0005,
      provenance: PROVENANCE.OBSERVED
    }
  };

  // Appel du vrai point d'entrée (comme processEventQueueImpl le fait à la ligne 191)
  const result = await checkNaturalSearchControl(ctx, event, false);
  console.log(`[1] checkNaturalSearchControl returned: ${result}`);

  // Vérifier que Natural Search state a été créé
  const nsRuntime = require('../../src/services/search/naturalSearchRuntime');
  const searchState = await nsRuntime.getOrCreateSearchState(agentId);
  assert.ok(searchState, 'Natural Search state created');
  assert.ok(searchState.ledger, 'Ledger initialized');
  assert.ok(searchState.controller, 'Controller initialized');
  assert.ok(searchState.actuator, 'Actuator initialized');
  console.log('[2] Natural Search runtime state wired via pipeline ✓');

  // Vérifier la persistance (point 8)
  const hypotheses = await persistence.loadHypothesesForAgent(agentId);
  const decisions = await persistence.loadRecentDecisions(agentId);
  const pressure = await persistence.loadPressureState(agentId);

  console.log(
    `[3] Persistence: hypotheses=${hypotheses.length}, decisions=${decisions.length}, pressure=${pressure ? 'yes' : 'no'}`
  );

  assert.ok(hypotheses.length >= 1, 'At least 1 hypothesis persisted');
  assert.ok(decisions.length >= 1, 'At least 1 decision persisted');
  assert.ok(pressure, 'Pressure state persisted');

  // Vérifier que l'hypothèse a été créée à partir de l'événement (point 3)
  const hyp = hypotheses[0];
  assert.ok(hyp.statement && hyp.statement.includes('auto-générée'), 'Hypothesis auto-generated from event');
  console.log(`[4] Hypothesis statement: ${hyp.statement}`);

  // Vérifier la sélection de processus
  let selection = searchState.controller.selectProcess({
    agentId,
    searchYield: 0.5,
    stepsSinceProgress: 10,
    falsifiedHypotheses: 0,
    contradictions: 0,
    activeHypothesesCount: searchState.ledger.activeHypotheses().length,
    budgetRatio: 0.3,
    causalProgressReport: searchState.causalProgress.report(),
    entropyMetrics: { normalizedEntropy: 0.55 }
  });
  console.log(`[5] Process selected: ${selection.process} (${selection.classification})`);

  // Augmenter la pression et vérifier la bascule de processus
  for (let i = 0; i < 5; i++) {
    selection = searchState.controller.selectProcess({
      agentId,
      searchYield: 0,
      stepsSinceProgress: 20,
      falsifiedHypotheses: 1,
      contradictions: 1,
      activeHypothesesCount: searchState.ledger.activeHypotheses().length,
      budgetRatio: 0.95,
      causalProgressReport: searchState.causalProgress.report(),
      entropyMetrics: { normalizedEntropy: 0.8 }
    });
  }
  console.log(`[6] After hysteresis: ${selection.process} (${selection.classification})`);
  assert.equal(
    selection.process,
    SEARCH_PROCESS.REPLAY_CAUSAL,
    'REPLAY_CAUSAL selected under high pressure + lock-in'
  );

  // Exécuter l'actuator
  const receipt = await searchState.actuator.execute(selection.process, {
    agentId,
    topology: 'isolated',
    tools: ['grep', 'test']
  });
  console.log(`[7] Actuator receipt: ${receipt.action} (${receipt.status})`);
  assert.ok(receipt.isSuccess(), 'Actuator executed successfully');

  console.log('\n=== Natural Search E2E Pipeline Test PASSED ===');
  await db.close();
}

runE2ETest().catch(err => {
  console.error('E2E Test Point 9 FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
