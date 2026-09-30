'use strict';

const assert = require('assert');
const { assertMissionDispatchAllowed } = require('../src/services/medical/missionQuarantineGate');

function fakeDb(row) {
  const statements = [];
  return {
    statements,
    async get() { return row; },
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

async function run() {
  await testHealthyMissionPasses();
  await testQuarantinedMissionIsBlocked();
  console.log('Mission quarantine gate checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
