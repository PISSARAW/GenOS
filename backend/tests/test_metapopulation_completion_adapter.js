'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMetapopulationRuntime } = require('../src/db/migrations/migrateMetapopulationRuntime');
const coordination = require('../src/services/metapopulationCoordinationService');
const runtime = require('../src/services/metapopulation/runtime/regionalRuntimeService');
const adapter = require('../src/services/topologyCompletionAdapters/metapopulationAdapter');
const { closureInput } = require('../src/services/topologyCompletionAdapters/dossier');
const { closeMission } = require('../src/services/missionClosureService');
const { digest } = require('../src/services/evidenceContractService');

const MISSION_ID = 'mission-metapopulation';
const SESSION_ID = 'metapopulation-session';
const WORKERS = ['worker-alpha', 'worker-beta'];

function proof(workerId, overrides = {}) {
  const content = { schema: 'genos.worker-barrier-closure-proof/v1',
    missionId: MISSION_ID, workerId, runId: `run-${workerId}`,
    result: { status: 'completed', verified: true }, ...overrides };
  return { reference: digest(content), content, source: 'biological_worker_receipts' };
}

function evidence(overrides = {}) {
  const proofs = WORKERS.map((workerId) => proof(workerId));
  return { members: WORKERS.map((memberId, index) => ({ memberId,
    status: 'completed', evidenceRefs: [proofs[index].reference] })),
  evidenceProofs: proofs, ...overrides };
}

function adapterInput(db, overrides = {}) {
  return { context: { db, missionId: MISSION_ID, mode: 'metapopulation',
    lifecycleState: 'completed', sessionId: SESSION_ID, output: { complete: true },
    ...(overrides.context || {}) }, evidence: overrides.evidence || evidence() };
}

async function createDeme(db, suffix, workerId) {
  const patchId = `patch-${suffix}`;
  const demeId = `deme-${suffix}`;
  await coordination.createPatch(SESSION_ID, { patchId, environment: {},
    requirements: [], resources: {}, carryingCapacity: 4,
    quality: 0.9, accessibility: 0.9 }, { db });
  await coordination.createDeme(SESSION_ID, { demeId, patchId,
    members: [workerId], localStrategies: [`strategy-${suffix}`],
    localProcedures: [`procedure-${suffix}`], lineage: { founders: [workerId] },
    fitness: { score: suffix === 'alpha' ? 0.8 : 0.7 } }, { db });
  await coordination.transitionDeme({ sessionId: SESSION_ID, demeId,
    status: 'ESTABLISHING' }, { db });
  await coordination.transitionDeme({ sessionId: SESSION_ID, demeId,
    status: 'ACTIVE' }, { db });
}

async function insertMigration(db) {
  const now = new Date().toISOString();
  await db.run(`INSERT INTO metapopulation_corridors
    (corridor_id, metapopulation_id, source_deme_id, target_deme_id, status,
     strength, protocol_json, enabled, capacity, migration_cost, compatibility,
     accepted_migrations, rejected_migrations, benefit_history_json,
     homogenization_risk, weight, created_at, provenance_json, occurred_at, updated_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', 1, '{}', 1, 2, 0.1, 0.9, 1, 0, '[]',
      0.1, 0.8, ?, '{}', ?, ?)`, 'corridor-alpha-beta', SESSION_ID,
  'deme-alpha', 'deme-beta', now, now, now);
  await db.run(`INSERT INTO metapopulation_migrations
    (migration_id, metapopulation_id, corridor_id, source_deme_id,
     target_deme_id, propagule_type, status, payload_ref, provenance_json,
     evidence_json, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, 'STRATEGY', 'ACCEPTED', ?, ?, ?, ?, ?)`,
  'migration-alpha-beta', SESSION_ID, 'corridor-alpha-beta', 'deme-alpha',
  'deme-beta', 'strategy-alpha', JSON.stringify({ source: 'regional-runtime' }),
  JSON.stringify({ sourceEvidence: ['worker-alpha-proof'],
    receiverValidation: { valid: true, evidence: { replay: 'passed' } } }), now, now);
  await coordination.recordMetapopulationEvent(SESSION_ID, {
    type: 'MIGRATION_ACCEPTED', payload: { migrationId: 'migration-alpha-beta',
      targetDemeId: 'deme-beta' }, provenance: { source: 'test-runtime' }
  }, { db });
}

async function insertFitness(db) {
  for (const [index, demeId] of ['deme-alpha', 'deme-beta'].entries()) {
    await db.run(`INSERT INTO mission_fitness
      (fitness_id, metapopulation_id, deme_id, mission_id, cycle,
       fitness_score, budget_used, budget_limit, created_at)
      VALUES (?, ?, ?, ?, 1, ?, 10, 100, ?)`, `fitness-${demeId}`,
    SESSION_ID, demeId, MISSION_ID, 0.8 - index * 0.1, new Date().toISOString());
  }
}

async function insertVerifiedCycle(db) {
  const adapters = { observe: async () => ({ demes: ['deme-alpha', 'deme-beta'] }),
    diagnose: async () => ({ summary: 'comparison complete' }),
    plan: async () => ({ actions: [{ type: 'MIGRATE_STRATEGY' }] }),
    execute: async () => ({ completed: true, migrationId: 'migration-alpha-beta' }),
    verify: async () => ({ valid: true, verifierId: 'regional-runtime-verifier',
      independent: true }) };
  const result = await runtime.runRegionalCycle({ metapopulationId: SESSION_ID,
    cycle: 1, actor: 'metapopulation-runtime' }, { db, adapters });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.verification.receipt.missionId, MISSION_ID);
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');
  await migrateMetapopulationRuntime(db);
  await coordination.createMetapopulationSession('Compare independent populations.', {
    db, missionId: MISSION_ID, metapopulationId: SESSION_ID
  });
  await createDeme(db, 'alpha', 'worker-alpha');
  await createDeme(db, 'beta', 'worker-beta');
  await insertMigration(db);
  await insertFitness(db);
  await insertVerifiedCycle(db);
  await db.run("UPDATE metapopulation_sessions SET status = 'CLOSED' WHERE id = ?", SESSION_ID);
  return db;
}

async function mutateReceipt(db, mutate) {
  const row = await db.get(`SELECT verification_json FROM metapopulation_cycle_states
    WHERE metapopulation_id = ? AND cycle = 1`, SESSION_ID);
  const verification = JSON.parse(row.verification_json);
  mutate(verification);
  await db.run(`UPDATE metapopulation_cycle_states SET verification_json = ?
    WHERE metapopulation_id = ? AND cycle = 1`, JSON.stringify(verification), SESSION_ID);
}

function reseal(receipt) {
  const body = { ...receipt };
  delete body.receiptHash;
  return { ...body, receiptHash: digest(body) };
}

async function expectReason(input) {
  const db = await fixture();
  try {
    if (input.mutate) await input.mutate(db);
    const dossier = await adapter.build(adapterInput(db, input.overrides));
    assert.equal(dossier.topologyValidation.status, input.status);
    assert.deepEqual(dossier.topologyValidation.reasons, [input.reason]);
  } finally { await db.close(); }
}

async function nominal() {
  const db = await fixture();
  try {
    const dossier = await adapter.build(adapterInput(db));
    assert.equal(dossier.topologyValidation.status, 'verified');
    assert.equal(dossier.oracle.independent, true);
    assert.equal(dossier.oracle.receipt.missionId, MISSION_ID);
    assert.equal(dossier.oracle.verifierIds[0], 'regional-runtime-verifier');
    assert.match(dossier.oracle.receipt.cycleVerificationReceiptHash, /^sha256:[a-f0-9]{64}$/);
    const completion = closeMission(closureInput(dossier));
    assert.equal(completion.verdict, 'succeeded', JSON.stringify(completion));
  } finally { await db.close(); }
}

async function foreignMission() {
  await expectReason({ status: 'failed', reason: 'metapopulation_mission_scope_mismatch',
    overrides: { context: { missionId: 'foreign-mission' } }
  });
}

async function missingStateAndPhase() {
  await expectReason({ mutate: (db) => db.run("UPDATE metapopulation_demes SET members_json = '[]'"),
    status: 'partial', reason: 'metapopulation_deme_members_missing' });
  await expectReason({ mutate: (db) => db.run(`UPDATE metapopulation_demes
    SET members_json = '{}' WHERE deme_id = 'deme-alpha'`),
  status: 'failed', reason: 'metapopulation_deme_state_invalid' });
  await expectReason({ mutate: (db) => db.run('DELETE FROM metapopulation_cycle_states'),
    status: 'partial', reason: 'metapopulation_verified_cycle_missing' });
  await expectReason({ mutate: (db) => db.run(`UPDATE metapopulation_events
    SET payload_json = '{"cycle":1,"status":"FAILED","verification":"VALID"}'
    WHERE event_type = 'REGIONAL_CYCLE_RECORDED'`),
  status: 'failed', reason: 'metapopulation_cycle_receipt_inconsistent' });
}

async function missingAndAlteredProofs() {
  const missing = evidence();
  missing.members[0] = { ...missing.members[0], evidenceRefs: [] };
  await expectReason({ status: 'partial', reason: 'metapopulation_worker_run_proof_missing',
    overrides: { evidence: missing } });
  const altered = evidence();
  altered.evidenceProofs[0] = proof('worker-alpha', { runId: null });
  altered.members[0] = { ...altered.members[0],
    evidenceRefs: [altered.evidenceProofs[0].reference] };
  await expectReason({ status: 'failed', reason: 'metapopulation_worker_run_proof_invalid',
    overrides: { evidence: altered } });
  const foreignSource = evidence();
  foreignSource.evidenceProofs[0] = { ...foreignSource.evidenceProofs[0], source: 'supplied' };
  await expectReason({ status: 'failed', reason: 'metapopulation_worker_run_proof_invalid',
    overrides: { evidence: foreignSource } });
}

async function missingAndAlteredOracle() {
  await expectReason({ mutate: (db) => db.run(`UPDATE metapopulation_cycle_states
    SET verification_json = '{}'`), status: 'partial',
  reason: 'metapopulation_cycle_oracle_missing' });
  await expectReason({ mutate: (db) => db.run(`UPDATE metapopulation_cycle_states
    SET verification_json = '{"valid":false}'`), status: 'failed',
  reason: 'metapopulation_cycle_oracle_inconsistent' });
  await expectReason({ mutate: (db) => mutateReceipt(db, (verification) => {
    delete verification.receipt;
  }), status: 'partial', reason: 'metapopulation_cycle_oracle_receipt_missing' });
  await expectReason({ mutate: (db) => mutateReceipt(db, (verification) => {
    verification.verifierId = 'metapopulation-runtime';
    verification.receipt.verifierId = 'metapopulation-runtime';
    const material = { ...verification };
    delete material.receipt;
    verification.receipt.verificationHash = digest(material);
    verification.receipt = reseal(verification.receipt);
  }), status: 'failed', reason: 'metapopulation_cycle_oracle_receipt_invalid' });
  await expectReason({ mutate: (db) => mutateReceipt(db, (verification) => {
    verification.receipt.missionId = 'foreign-mission';
    verification.receipt = reseal(verification.receipt);
  }), status: 'failed', reason: 'metapopulation_cycle_oracle_receipt_invalid' });
  await expectReason({ mutate: (db) => mutateReceipt(db, (verification) => {
    verification.receipt.resultHash = digest({ altered: true });
    verification.receipt = reseal(verification.receipt);
  }), status: 'failed', reason: 'metapopulation_cycle_oracle_receipt_invalid' });
}

async function run() {
  await nominal();
  await foreignMission();
  await missingStateAndPhase();
  await missingAndAlteredProofs();
  await missingAndAlteredOracle();
  console.log('Metapopulation completion adapter: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
