'use strict';

const assert = require('node:assert/strict');
const adapter = require('../src/services/topologyCompletionAdapters/holobionteAdapter');
const { closureInput } = require('../src/services/topologyCompletionAdapters/dossier');
const { closeMission } = require('../src/services/missionClosureService');
const fixture = require('./helpers/holobiontMissionFixtures');

const MISSION = 'mission-holobionte-completion';

function input(state, missionId = MISSION) {
  return { context: { db: state.db, mode: 'holobionte', missionId,
    holobiontId: state.run?.holobiontId,
    output: { holobiontId: state.run?.holobiontId, complete: true } },
  evidence: { members: [], evidenceProofs: [] } };
}

async function seedRun() {
  const db = await fixture.open({ filename: ':memory:', driver: fixture.sqlite3.Database });
  const mission = fixture.mission({ missionId: MISSION });
  const run = await fixture.service.runHolobiontMission(db, mission);
  return { db, mission, run };
}

async function withRun(test) {
  const state = await seedRun();
  try { await test(state); } finally { await state.db.close(); }
}

async function dropTrigger(db, name) {
  await db.exec(`DROP TRIGGER IF EXISTS ${name}`);
}

async function mutateOracle(state, immuneReview) {
  await dropTrigger(state.db, 'holobiont_ledger_no_update');
  await dropTrigger(state.db, 'holobiont_events_no_update');
  await state.db.run(`UPDATE holobiont_symbiosis_ledger SET immune_review_json = ?
    WHERE holobiont_id = ?`, JSON.stringify(immuneReview), state.run.holobiontId);
  const row = await state.db.get(`SELECT event_id, payload_json FROM holobiont_events
    WHERE holobiont_id = ? AND event_type = 'CONTRIBUTION_VERIFIED'`,
  state.run.holobiontId);
  const payload = JSON.parse(row.payload_json);
  payload.immuneReview = immuneReview;
  await state.db.run('UPDATE holobiont_events SET payload_json = ? WHERE event_id = ?',
    JSON.stringify(payload), row.event_id);
}

async function nominal(state) {
  const dossier = await adapter.build(input(state));
  assert.equal(dossier.topologyValidation.status, 'verified');
  assert.equal(dossier.oracle.independent, true);
  assert.equal(dossier.oracle.receipt.holobiontId, state.run.holobiontId);
  assert.equal(closeMission(closureInput(dossier)).verdict, 'succeeded');
}

async function foreignMissionFails(state) {
  const dossier = await adapter.build(input(state, 'mission-foreign'));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['holobionte_mission_scope_mismatch']);
}

async function missingStateIsPartial() {
  const db = await fixture.open({ filename: ':memory:', driver: fixture.sqlite3.Database });
  try {
    const dossier = await adapter.build(input({ db, run: null }));
    assert.equal(dossier.topologyValidation.status, 'partial');
    assert.deepEqual(dossier.topologyValidation.reasons, ['holobionte_session_missing']);
  } finally { await db.close(); }
}

async function missingPhaseIsPartial() {
  const state = await fixture.fixture();
  try {
    const dossier = await adapter.build(input({ db: state.db,
      run: { holobiontId: state.input.holobiontId } }, state.input.missionId));
    assert.equal(dossier.topologyValidation.status, 'partial');
    assert.deepEqual(dossier.topologyValidation.reasons,
      ['holobionte_terminal_phase_missing']);
  } finally { await state.db.close(); }
}

async function missingProofIsPartial(state) {
  await dropTrigger(state.db, 'holobiont_memories_no_delete');
  await state.db.run('DELETE FROM holobiont_memories WHERE source_holobiont_id = ?',
    state.run.holobiontId);
  const dossier = await adapter.build(input(state));
  assert.equal(dossier.topologyValidation.status, 'partial');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['holobionte_execution_memory_missing']);
}

async function alteredProofFails(state) {
  await dropTrigger(state.db, 'holobiont_memories_no_update');
  await state.db.run(`UPDATE holobiont_memories SET evidence_refs_json = ?
    WHERE source_holobiont_id = ?`, JSON.stringify(['altered-evidence']),
  state.run.holobiontId);
  const dossier = await adapter.build(input(state));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['holobionte_execution_memory_mismatch']);
}

async function missingOracleIsPartial(state) {
  await mutateOracle(state, {});
  const dossier = await adapter.build(input(state));
  assert.equal(dossier.topologyValidation.status, 'partial');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['holobionte_independent_oracle_missing']);
}

async function alteredOracleFails(state) {
  const rejected = { allowed: false, blocked: true, decision: 'reject' };
  await mutateOracle(state, rejected);
  const dossier = await adapter.build(input(state));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['holobionte_independent_oracle_rejected']);
}

async function alteredInvariantFails(state) {
  const row = await state.db.get(`SELECT session_json FROM holobiont_sessions
    WHERE holobiont_id = ?`, state.run.holobiontId);
  const session = JSON.parse(row.session_json);
  session.constitution.authorityCeiling = 'SYSTEM';
  await state.db.run('UPDATE holobiont_sessions SET session_json = ? WHERE holobiont_id = ?',
    JSON.stringify(session), state.run.holobiontId);
  const dossier = await adapter.build(input(state));
  assert.equal(dossier.topologyValidation.status, 'failed');
  assert.deepEqual(dossier.topologyValidation.reasons,
    ['holobionte_constitution_invariant_failed']);
}

async function run() {
  await missingStateIsPartial();
  await missingPhaseIsPartial();
  const tests = [nominal, foreignMissionFails, missingProofIsPartial,
    alteredProofFails, missingOracleIsPartial, alteredOracleFails, alteredInvariantFails];
  for (const test of tests) await withRun(test);
  console.log('Holobionte completion adapter: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
