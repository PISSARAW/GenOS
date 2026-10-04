'use strict';

const assert = require('assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { assertMissionDispatchAllowed } = require('../src/services/medical/missionQuarantineGate');
const { incarnateAgent } = require('../src/services/agents/agentIncarnationService');

function fakeDb(row) {
  const statements = [];
  return {
    statements,
    async get(sql) {
      if (sql.includes('FROM pathologies')) {
        return { clinical_state_id: row.id, pathologyType: 'cognitive_metastasis', severity: 0.9, confidence: 0.93 };
      }
      return row;
    },
    async all() { return []; },
    async run(sql, ...params) { statements.push({ sql, params }); },
  };
}

function stateRow({ cognitiveIntegrity = 1, wellness = 1 } = {}) {
  return {
    id: 'clinical-parent', agent_id: 'parent-1',
    vitals_json: JSON.stringify({ cognitiveIntegrity, stress: 0, energy: 1, budgetRatio: 1, dissonance: 0, apoptosisRisk: 0 }),
    immune_titer: 1, inflammatory_index: 0, cell_cycle_state: 'G0',
    plasmid_load: 0, pathogen_burden: 0, iatrogenic_load: 0,
    wellness_score: wellness,
  };
}

async function testHealthyMissionPasses() {
  const db = fakeDb(stateRow());
  const result = await assertMissionDispatchAllowed(db, 'parent-1');
  assert.deepEqual(result, { checked: true, quarantined: false, detectionCount: 0 });
  assert.ok(db.statements.some(({ params }) => params.includes('surveillance_scan')));
}

async function testQuarantinedMissionIsBlocked() {
  const db = fakeDb(stateRow({ cognitiveIntegrity: 0.1, wellness: 0.1 }));
  await assert.rejects(
    assertMissionDispatchAllowed(db, 'parent-1'),
    (error) => error.code === 'AGENT_QUARANTINED'
  );
  assert.ok(db.statements.some(({ sql }) => sql.includes("SET status = 'blocked'")));
  assert.ok(db.statements.some(({ sql }) => sql.includes("SET cell_cycle_state = 'arrested'")));
}

async function testProductionIncarnationGatePersistsQuarantine() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-incarnation-quarantine-'));
  const dbPath = path.join(directory, 'quarantine.db');
  let db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'running', updated_at TEXT);
      CREATE TABLE clinical_states (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL UNIQUE, vitals_json TEXT NOT NULL,
        immune_titer REAL NOT NULL, inflammatory_index REAL NOT NULL, cell_cycle_state TEXT NOT NULL,
        plasmid_load REAL NOT NULL, pathogen_burden REAL NOT NULL, iatrogenic_load REAL NOT NULL,
        wellness_score REAL NOT NULL, observed_at TEXT, updated_at TEXT
      );
      CREATE TABLE immune_events (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, clinical_state_id TEXT,
        event_type TEXT NOT NULL, event_json TEXT NOT NULL, severity TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE treatments (
        therapy_type TEXT, status TEXT, efficacy_score REAL, agent_id TEXT, prescribed_at TEXT
      );
      CREATE TABLE pathologies (
        id TEXT PRIMARY KEY, agent_id TEXT, clinical_state_id TEXT, pathology_type TEXT,
        severity REAL, confidence REAL, evidence_json TEXT, biopsy_ref TEXT, status TEXT
      );`);
    await db.run('INSERT INTO agents (id, status) VALUES (?, ?)', 'quarantined-parent', 'running');
    await db.run(`INSERT INTO clinical_states
      (id, agent_id, vitals_json, immune_titer, inflammatory_index, cell_cycle_state,
       plasmid_load, pathogen_burden, iatrogenic_load, wellness_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'clinical-quarantined', 'quarantined-parent', JSON.stringify({ cognitiveIntegrity: 0.05, stress: 0, energy: 0.1, budgetRatio: 1, dissonance: 0.9, apoptosisRisk: 0 }),
    1, 0, 'G0', 0, 0, 0, 0.05);

    await assert.rejects(incarnateAgent({
      ctx: { db, parent: { id: 'quarantined-parent', cognitive_budget: 100 } },
      request: { role: 'bounded_worker', parentAgentId: 'quarantined-parent', mission: { prompt: 'blocked mission' } },
    }), error => error.code === 'AGENT_QUARANTINED');
    assert.equal((await db.get('SELECT status FROM agents WHERE id = ?', 'quarantined-parent')).status, 'blocked');
    assert.equal((await db.get('SELECT cell_cycle_state FROM clinical_states WHERE agent_id = ?', 'quarantined-parent')).cell_cycle_state, 'arrested');
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM immune_events WHERE agent_id = ?', 'quarantined-parent')).count >= 2, true);
    await db.close();
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    assert.equal((await db.get('SELECT status FROM agents WHERE id = ?', 'quarantined-parent')).status, 'blocked');
    assert.equal((await db.get('SELECT cell_cycle_state FROM clinical_states WHERE agent_id = ?', 'quarantined-parent')).cell_cycle_state, 'arrested');
  } finally {
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function testInvalidClinicalStateFailsClosed() {
  const malformed = fakeDb({ ...stateRow(), vitals_json: '{broken-json' });
  await assert.rejects(assertMissionDispatchAllowed(malformed, 'parent-1'),
    (error) => error.code === 'IMMUNE_SURVEILLANCE_UNAVAILABLE');
  await assert.rejects(assertMissionDispatchAllowed(null, 'parent-1'),
    (error) => error.code === 'IMMUNE_SURVEILLANCE_UNAVAILABLE');
}

async function run() {
  await testHealthyMissionPasses();
  await testQuarantinedMissionIsBlocked();
  await testProductionIncarnationGatePersistsQuarantine();
  await testInvalidClinicalStateFailsClosed();
  console.log('Mission quarantine gate and durable incarnation refusal checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
