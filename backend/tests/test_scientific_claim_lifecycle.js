'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateScientificEvidenceLedger: migrate } = require('../src/db/migrations/migrateScientificEvidenceLedger');
const { createScientificEvidenceLedger: ledger } = require('../src/services/scientificEvidenceLedger');
const bridge = require('../src/services/morphogenesis/capabilities/trinityMeristemBridge');

async function read(db, experimentId = 'exp-a') {
  return (await ledger(db).inspectExperiment({ experimentId })).claims[0];
}

async function seed(db) {
  await db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
  await migrate(db);
  await migrate(db);
  for (const id of ['a', 'b']) {
    await ledger(db).createExperiment({ experimentId: `exp-${id}`, title: id, proofLevel: 'L2', createdBy: 'researcher' });
    await ledger(db).recordClaim({ experimentId: `exp-${id}`, claimId: `claim-${id}`, statement: `Hypothesis ${id}`, createdBy: 'researcher' });
  }
  await ledger(db).recordEvidence({ experimentId: 'exp-a', claimId: 'claim-a', evidenceId: 'evidence-a',
    relation: 'CONTRADICTS', sourceKind: 'fixture', sourceId: 'test-run', evidence: { result: 'negative' }, createdBy: 'runner' });
  await ledger(db).recordAssessment({ claimId: 'claim-a', assessmentId: 'retained-assessment',
    kind: 'verifier', position: 'support', verifierStatus: 'verified', rationale: 'Legacy verifier declaration', createdBy: 'reviewer' });
  await migrate(db);
  assert.equal((await read(db)).lifecycle.status, 'proposed', 'Existing claims survive repeated migration');
}

function transition(claim, overrides = {}) {
  return { experimentId: 'exp-a', claimId: 'claim-a', eventId: 'reject-a',
    expectedHeadHash: claim.lifecycle.headHash, status: 'rejected', rationale: 'Counterexample retained',
    evidenceRefs: ['evidence-a'], createdBy: 'reviewer', ...overrides };
}

async function testRefusals(db) {
  const claim = await read(db);
  const input = transition(claim);
  for (const status of ['verified', 'supported', 'proposed']) {
    await assert.rejects(ledger(db).recordClaimTransition({ ...input, status }), { code: 'SCIENTIFIC_CLAIM_TRANSITION_INVALID' });
  }
  await assert.rejects(ledger(db).recordClaimTransition({ ...input, experimentId: 'exp-b' }), { code: 'SCIENTIFIC_CLAIM_SCOPE_MISMATCH' });
  await assert.rejects(ledger(db).recordClaimTransition({ ...input, evidenceRefs: ['unknown'] }), { code: 'SCIENTIFIC_EVIDENCE_REFERENCE_UNKNOWN' });
  await assert.rejects(ledger(db).recordClaimTransition({ ...input, evidenceRefs: 'evidence-a' }), { code: 'SCIENTIFIC_LIFECYCLE_INVALID' });
  await assert.rejects(ledger(db).recordClaimTransition({ ...input, rationale: ' ' }), { code: 'SCIENTIFIC_LIFECYCLE_INVALID' });
  assert.equal((await read(db)).lifecycle.events.length, 0);
  return input;
}

async function testControllerScope(db) {
  process.env.GENOS_DB_PATH = path.join(os.tmpdir(), `unused-p1-controller-${process.pid}.db`);
  const controller = require('../src/controllers/scientificEvidenceController');
  const req = { scientificEvidenceDb: db, scientificExperiment: { id: 'exp-a' }, user: { username: 'reviewer' },
    params: { claimId: 'claim-b' }, body: { kind: 'consensus', position: 'reject', rationale: 'foreign claim' } };
  let error;
  const res = { status() { return this; }, json() { throw new Error('Foreign assessment must not succeed'); } };
  await controller.recordAssessment(req, res, value => { error = value; });
  assert.equal(error?.code, 'SCIENTIFIC_CLAIM_SCOPE_MISMATCH');
  assert.equal(error.status, 404);
  req.body = transition(await read(db));
  await controller.recordClaimTransition(req, res, value => { error = value; });
  assert.equal(error?.code, 'SCIENTIFIC_CLAIM_SCOPE_MISMATCH');
  assert.equal((await db.get('SELECT count(*) AS n FROM scientific_assessments')).n, 1);
}

async function testConcurrency(db, filename) {
  const input = await testRefusals(db);
  const other = await open({ filename, driver: sqlite3.Database });
  try {
    await other.exec('PRAGMA busy_timeout = 5000');
    const competing = { ...input, eventId: 'reject-concurrent' };
    const results = await Promise.allSettled([ledger(db).recordClaimTransition(input), ledger(other).recordClaimTransition(competing)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SCIENTIFIC_CLAIM_STATE_CONFLICT');
    const current = await read(db);
    assert.equal(current.lifecycle.events.length, 1);
    await assert.rejects(bridge.sealScientificWave(db, { scopeId: 'fixture', results: [{ assessmentId: 'retained-assessment' }] }),
      /SCIENTIFIC_CLAIM_INACTIVE/);
    const event = current.lifecycle.events[0];
    const replayInput = event.eventId === input.eventId ? input : competing;
    assert.deepEqual(await ledger(other).recordClaimTransition(replayInput), event);
    await assert.rejects(ledger(db).recordClaimTransition({ ...replayInput, rationale: 'changed retry' }), { code: 'SCIENTIFIC_CLAIM_EVENT_CONFLICT' });
    await ledger(db).recordClaimTransition(transition(current, { eventId: 'retract-final', status: 'retracted' }));
    assert.deepEqual(await ledger(other).recordClaimTransition(replayInput), event, 'Replay remains stable after a later event');
  } finally { await other.close(); }
}

async function testRetraction(db) {
  const claim = await read(db);
  assert.equal(claim.lifecycle.status, 'retracted');
  assert.deepEqual(claim.lifecycle.events.map(event => event.status), ['rejected', 'retracted']);
  assert.equal(claim.evidence.length, 1);
  assert.equal(claim.lifecycle.promotionEligible, false);
  await assert.rejects(ledger(db).recordClaimTransition(transition(claim, { eventId: 'resurrect', status: 'proposed' })),
    { code: 'SCIENTIFIC_CLAIM_TRANSITION_INVALID' });
  await assert.rejects(bridge.sealScientificWave(db, { scopeId: 'fixture', results: [{ assessmentId: 'retained-assessment' }] }),
    /SCIENTIFIC_CLAIM_INACTIVE/);
  assert.equal((await read(db)).assessments.length, 1, 'Historical assessment remains inspectable');
  await assert.rejects(db.run('UPDATE scientific_claims SET statement = ?', 'changed'), /immutable/);
  await assert.rejects(db.run('UPDATE scientific_claim_events SET payload_json = ?', '{}'), /immutable/);
  await assert.rejects(db.run('DELETE FROM scientific_claim_events'), /immutable/);
}

function freshProcess(filename) {
  const child = spawnSync(process.execPath, [__filename, '--read', filename], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const observed = JSON.parse(child.stdout);
  assert.notEqual(observed.pid, process.pid);
  assert.equal(observed.status, 'retracted');
  assert.equal(observed.events, 2);
  assert.equal(observed.evidence, 1);
  assert.equal(observed.assessments, 1);
}

async function tamper(db) {
  await db.exec('DROP TRIGGER scientific_claim_events_no_update');
  const row = await db.get('SELECT event_id, payload_json FROM scientific_claim_events LIMIT 1');
  const item = JSON.parse(row.payload_json);
  item.rationale = 'tampered after restart';
  await db.run('UPDATE scientific_claim_events SET payload_json = ? WHERE event_id = ?', JSON.stringify(item), row.event_id);
  await assert.rejects(read(db), { code: 'SCIENTIFIC_CLAIM_HISTORY_CORRUPT' });
  await db.run('UPDATE scientific_claim_events SET payload_json = ? WHERE event_id = ?', '{broken', row.event_id);
  await assert.rejects(read(db), { code: 'SCIENTIFIC_CLAIM_HISTORY_CORRUPT' });
}

async function readChild(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    const claim = await read(db);
    console.log(JSON.stringify({ pid: process.pid, status: claim.lifecycle.status, events: claim.lifecycle.events.length,
      evidence: claim.evidence.length, assessments: claim.assessments.length }));
  } finally { await db.close(); }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-claims-'));
  const filename = path.join(root, 'claims.db');
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    await seed(db);
    await testControllerScope(db);
    await testConcurrency(db, filename);
    await testRetraction(db);
    freshProcess(filename);
    await tamper(db);
  } finally {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log('P1 L01 claim lifecycle: scope refusals, concurrent stale-head rejection, replay, restart, retained history and corruption detection passed.');
}

const job = process.argv[2] === '--read' ? readChild(process.argv[3]) : main();
job.catch(error => { console.error(error); process.exitCode = 1; });
