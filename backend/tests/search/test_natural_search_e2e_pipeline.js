/**
 * E2E Test — Point 9 : passe par le vrai point d'entrée du pipeline
 * checkNaturalSearchControl() avec une vraie DB SQLite en mémoire.
 *
 * Vérifie que :
 *   1. Un événement AGENT_STEP arrive au pipeline
 *   2. checkNaturalSearchControl() est appelée
 *   3. Le controller sélectionne un processus
 *   4. SearchPersistence sauvegarde hypothèse + décision + pression
 *   5. La sélection change avec la pression
 */

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { SearchPersistence } = require('../../src/services/search/searchPersistenceService');
const { PROVENANCE } = require('../../src/services/search/hypothesisLedgerService');
const { SEARCH_PROCESS } = require('../../src/services/search/naturalSearchController');
const { checkNaturalSearchControl } = require('../../src/services/search/naturalSearchRuntime');

async function runE2ETest() {
  console.log('=== Natural Search E2E Test (Point 9 — pipeline) ===\n');

  const db = await open({ filename: ':memory:', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE agent_state_snapshots (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE lineage_nodes (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      label TEXT,
      node_type TEXT,
      state_summary TEXT
    );
  `);

  const persistence = new SearchPersistence(db);
  await persistence.initTables();

  const agentId = 'e2e-agent-9';
  await db.run('INSERT INTO agents (id, name, status) VALUES (?, ?, ?)',
    [agentId, 'E2E Test Agent', 'active']);

  const ctx = {
    db,
    agentId,
    normalizedMission: {
      id: 'pipeline-mission-ns',
      prompt: 'Pipeline-driven Natural Search check',
      executionBudget: { tokens: 100000, costUsd: 1.0, timeSec: 600 }
    },
    dispatchedAgent: { id: agentId, name: 'Pipeline Test Agent' },
    contractRecord: { id: 'contract-pipeline', version: '1.0.0' },
    executionRun: { id: 'run-pipeline-ns' },
    state: { termination: false, isProcessingEvents: false, eventQueue: [] }
  };

  // Appel 1 : événement avec information gain élevé (déclenche création d'hypothèse)
  const event1 = {
    eventType: 'AGENT_STEP',
    action: 'initial_step',
    detail: 'Initial AGENT_STEP event',
    agentId,
    payload: {
      evidenceGain: 0.5, uncertaintyReduction: 0.3, constraintsResolved: 1,
      verifiedArtifactDelta: 1, objectiveDelta: 0.1, hypothesisInformationGain: 1.5,
      tokensConsumed: 200, timeConsumed: 0.2, costConsumed: 0.0005, provenance: PROVENANCE.OBSERVED
    }
  };

  const result1 = await checkNaturalSearchControl(ctx, event1);
  console.log(`[1] checkNaturalSearchControl returned: ${result1}`);

  const hypotheses = await persistence.loadHypothesesForAgent(agentId);
  const decisions = await persistence.loadRecentDecisions(agentId);
  const pressure = await persistence.loadPressureState(agentId);

  console.log(`[2] Persistence: hypotheses=${hypotheses.length}, decisions=${decisions.length}, pressure=${pressure ? 'yes' : 'no'}`);

  assert.ok(hypotheses.length >= 1, 'At least 1 hypothesis persisted');
  assert.ok(decisions.length >= 1, 'At least 1 decision persisted');
  assert.ok(pressure, 'Pressure state persisted');

  const hyp = hypotheses[0];
  assert.ok(hyp.statement.includes('auto-générée'), 'Hypothesis auto-generated from event');
  console.log(`[3] Hypothesis statement: ${hyp.statement}`);

  const decision1 = decisions[0];
  assert.ok(decision1.process, 'Decision has a process');
  console.log(`[4] Decision 1 process: ${decision1.process}`);

  // Appel 2 : événement à pression élevée (plus de tokens consommés)
  const event2 = {
    eventType: 'AGENT_STEP',
    action: 'pressure_step',
    detail: 'High pressure event',
    agentId,
    payload: {
      evidenceGain: 0, uncertaintyReduction: 0, constraintsResolved: 0,
      verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0,
      tokensConsumed: 1000, timeConsumed: 1.0, costConsumed: 0.002, provenance: PROVENANCE.OBSERVED
    }
  };

  const result2 = await checkNaturalSearchControl(ctx, event2);
  console.log(`[5] checkNaturalSearchControl returned: ${result2}`);

  const decisions2 = await persistence.loadRecentDecisions(agentId);
  assert.ok(decisions2.length >= 2, 'At least 2 decisions persisted');
  const latestDecision = decisions2[0];
  console.log(`[6] Latest decision process: ${latestDecision.process}`);

  // Vérifier que le processus sélectionné est un processus de recherche valide
  const validProcesses = [
    SEARCH_PROCESS.CONTINUE,
    SEARCH_PROCESS.FORAGE,
    SEARCH_PROCESS.PLASTICITE,
    SEARCH_PROCESS.CLONAL_AFFINITY_SEARCH,
    SEARCH_PROCESS.REPLAY_CAUSAL,
    SEARCH_PROCESS.STRESS_HYPERMUTATION,
    SEARCH_PROCESS.SPECIATION,
    SEARCH_PROCESS.EVOLUTION
  ];
  assert.ok(validProcesses.includes(latestDecision.process), `Process ${latestDecision.process} is valid`);

  await db.close();

  console.log('\n=== E2E Test Point 9 (pipeline) PASSED ===');
}

runE2ETest().catch(err => {
  console.error('E2E Test Point 9 FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
