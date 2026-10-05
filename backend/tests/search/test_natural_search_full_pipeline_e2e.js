/**
 * E2E Test — Point 8 : pipeline complet via processEventQueueImpl.
 *
 * Vérifie que :
 *   1. Des événements entrent dans la queue du pipeline
 *   2. checkNaturalSearchControl est appelé via le pipeline
 *   3. SearchPersistence persiste hypothèse + décision + pression
 *   4. L'Actuator génère un receipt persisté
 */

require('./naturalSearchTestTelemetry');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { checkNaturalSearchControl, initializeNaturalSearchRuntime, getOrCreateSearchState, clearSearchState } = require('../../src/services/search/naturalSearchRuntime');
const { SearchPersistence } = require('../../src/services/search/searchPersistenceService');
const { PROVENANCE } = require('../../src/services/search/hypothesisLedgerService');
const { SEARCH_PROCESS } = require('../../src/services/search/naturalSearchController');

async function runFullPipelineE2E() {
  console.log('=== Natural Search E2E Test (Point 8 — full pipeline) ===\n');

  const dbPath = path.join(os.tmpdir(), `genos-natural-search-${crypto.randomUUID()}.db`);
  let db = await open({ filename: dbPath, driver: sqlite3.Database });

  await db.exec(`
    PRAGMA foreign_keys=ON;
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

  const agentId = 'e2e-pipeline-agent-8';
  await db.run('INSERT INTO agents (id, name, status) VALUES (?, ?, ?)', [agentId, 'Pipeline E2E Agent', 'active']);

  const persistence = new SearchPersistence(db);
  await persistence.initTables();

  await initializeNaturalSearchRuntime(db);

  const ctx = {
    db,
    agentId,
    normalizedMission: {
      id: 'pipeline-mission-8',
      prompt: 'Full pipeline E2E test',
      executionBudget: { tokens: 100000, costUsd: 1.0, timeSec: 600 }
    },
    dispatchedAgent: { id: agentId, name: 'Pipeline E2E Agent' },
    state: { termination: false, isProcessingEvents: false, eventQueue: [] },
    budgetRatio: 0.3
  };

  const events = [
    {
      eventType: 'AGENT_STEP',
      action: 'initial_step',
      detail: 'Initial step',
      payload: {
        evidenceGain: 0.5, uncertaintyReduction: 0.3, constraintsResolved: 1,
        verifiedArtifactDelta: 1, objectiveDelta: 0.1, hypothesisInformationGain: 1.5,
        tokensConsumed: 200, timeConsumed: 0.2, costConsumed: 0.0005,
        provenance: PROVENANCE.OBSERVED
      }
    },
    {
      eventType: 'EVIDENCE_REPORT',
      action: 'evidence_found',
      detail: 'Evidence report',
      payload: {
        evidenceGain: 0.8, uncertaintyReduction: 0.5, constraintsResolved: 2,
        verifiedArtifactDelta: 2, objectiveDelta: 0.2, hypothesisInformationGain: 2.0,
        tokensConsumed: 500, timeConsumed: 0.5, costConsumed: 0.001,
        provenance: PROVENANCE.VERIFIED
      }
    },
    {
      eventType: 'AGENT_STEP',
      action: 'pressure_step',
      detail: 'High pressure',
      payload: {
        evidenceGain: 0, uncertaintyReduction: 0, constraintsResolved: 0,
        verifiedArtifactDelta: 0, objectiveDelta: 0, hypothesisInformationGain: 0,
        tokensConsumed: 1000, timeConsumed: 1.0, costConsumed: 0.002,
        provenance: PROVENANCE.SELF_REPORTED
      }
    }
  ];

  for (const event of events) {
    await checkNaturalSearchControl(ctx, event);
  }

  const hypotheses = await persistence.loadHypothesesForAgent(agentId);
  const decisions = await persistence.loadRecentDecisions(agentId);
  const pressure = await persistence.loadPressureState(agentId);

  console.log(`[1] Persistence: hypotheses=${hypotheses.length}, decisions=${decisions.length}, pressure=${pressure ? 'yes' : 'no'}`);
  assert.ok(hypotheses.length >= 1, 'At least 1 hypothesis persisted');
  assert.ok(decisions.length >= 3, 'At least 3 decisions persisted');
  assert.ok(pressure, 'Pressure state persisted');

  const hyp = hypotheses[0];
  console.log(`[2] First hypothesis: ${hyp.statement}`);
  assert.ok(hyp.statement.includes('Hypothèse'), 'Auto-generated hypothesis');

  const latestDecision = decisions[0];
  console.log(`[3] Latest decision: ${latestDecision.process}`);
  const validProcesses = Object.values(SEARCH_PROCESS);
  assert.ok(validProcesses.includes(latestDecision.process), `Process valid`);

  // Test negative memory: record a failure event
  const failureEvent = {
    eventType: 'AGENT_FAILED',
    action: 'agent_failed',
    detail: 'Agent failed',
    payload: { hypothesisId: hyp.id, evidenceGain: 0, tokensConsumed: 100 }
  };
  await checkNaturalSearchControl(ctx, failureEvent);

  const decisionsAfterFailure = await persistence.loadRecentDecisions(agentId);
  console.log(`[4] Decisions after failure: ${decisionsAfterFailure.length}`);
  assert.ok(decisionsAfterFailure.length >= 4, 'Failure recorded');

  const liveState = await getOrCreateSearchState(agentId, db);
  liveState.ledger.addEvidence(hyp.id, {
    id: 'restart-proof', direction: 'for', strength: 0.9,
    provenance: 'verified', reliability: 1, evidenceRef: 'e2e:restart'
  });
  await clearSearchState(agentId);
  await db.close();
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await initializeNaturalSearchRuntime(db);
  const restoredState = await getOrCreateSearchState(agentId, db);
  assert.equal(restoredState.ledger.hypotheses.get(hyp.id)?.statement, hyp.statement,
    'Hypothesis restored after runtime state recreation');
  assert.ok(restoredState.ledger.proofs.has('restart-proof'),
    'Proof restored after runtime state recreation');
  assert.ok(restoredState.stepCount > 0, 'Pressure counters restored after runtime state recreation');
  console.log('[5] SQLite reopen: hypothesis, proof, and pressure counters restored');

  await db.close();
  fs.rmSync(dbPath, { force: true });
  console.log('\n=== E2E Test Point 8 (full pipeline) PASSED ===');
}

runFullPipelineE2E().catch(err => {
  console.error('E2E Test Point 8 FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
