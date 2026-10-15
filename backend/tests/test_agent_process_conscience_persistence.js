'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const conscience = require('../src/services/agentConscienceService');
const pipeline = require('../src/services/agentProcessEventPipeline');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agents (
    id TEXT PRIMARY KEY, dissonance_level REAL, eureka_count INTEGER,
    cognitive_budget REAL, cognitive_baseline_budget REAL,
    cognitive_max_dissonance REAL, is_apoptotic INTEGER,
    conscience_revision INTEGER, status TEXT, updated_at TEXT
  );
  CREATE TABLE conscience_transitions (
    agent_id TEXT, from_revision INTEGER, to_revision INTEGER,
    from_dissonance REAL, to_dissonance REAL, from_budget REAL,
    to_budget REAL, from_apoptotic INTEGER, to_apoptotic INTEGER,
    reason TEXT
  );`);
  await db.run(`INSERT INTO agents VALUES (
    'worker', 0, 0, 100, 100, 50, 0, 0, 'running', CURRENT_TIMESTAMP
  )`);
  const conscienceState = conscience.createCognitiveRegulationState();
  const ctx = {
    db, agentId: 'worker', conscienceState, normalizedMission: {},
    state: { termination: null }, haltRuntime() {}
  };
  await pipeline.runConscienceCheck(ctx, {
    eventType: 'AGENT_RUNTIME_ERROR', severity: 'error', detail: 'test failure', payload: {}
  }, null);
  const agent = await db.get('SELECT dissonance_level, conscience_revision FROM agents WHERE id = ?', 'worker');
  const transition = await db.get('SELECT reason FROM conscience_transitions WHERE agent_id = ?', 'worker');
  assert.ok(agent.dissonance_level > 0);
  assert.equal(agent.conscience_revision, 1);
  assert.equal(transition.reason, 'supervisor_error');
  await db.close();
  console.log('Agent process conscience persistence: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
