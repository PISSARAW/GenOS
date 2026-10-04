'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMorphogenesisCapabilities } = require('../src/db/migrations/migrateMorphogenesisCapabilities');
const evidenceStore = require('../src/services/morphogenesis/capabilities/capabilityEvidenceStore');
const experimentalCoverage = require('../src/services/rhizome/growth/experimentalCoverageService');
const search = require('../src/services/morphogenesis/synthesis/morphologySearchPolicy');
const schedule = require('../src/services/ontogenesis/scheduleService');
const cambium = require('../src/services/morphogenesis/capabilities/cambiumService');
const holobiontStore = require('../src/services/holobionte/holobiontStore');
const memory = require('../src/services/holobionte/memory/symbioticMemoryService');
const risk = require('../src/services/morphogenesis/capabilities/riskLedgerService');
const statisticalReceipt = require('../src/services/morphogenesis/capabilities/statisticalReceipt');
const biocenoseGate = require('../src/services/biocenose/judgment/promotionGateService');

function experiment() {
  return { experimentId: 'experiment', hypothesisId: 'hypothesis', verifierId: 'verifier',
    predictions: ['duplicate'], discriminatingOutcomes: ['yes', 'no'],
    utility: 0.9, cost: 0.1 };
}

async function testMeristem(db) {
  await evidenceStore.recordCoverage(db, { receiptId: 'receipt', scopeId: 'mission',
    status: 'VERIFIED', verifierId: 'verifier', verificationRef: 'verification',
    evidenceRefs: ['trial'], experiment: experiment(), resolveArtifact: async () => true });
  const valid = await experimentalCoverage.optionsForGrowth(db, { experimentalScopeId: 'mission',
    resolveArtifact: async () => true, experimentalCoverageReceipts: [{ status: 'FORGED' }] });
  assert.equal(valid.experimentalCoverageReceipts.length, 1);
  const lost = await experimentalCoverage.optionsForGrowth(db, { experimentalScopeId: 'mission',
    resolveArtifact: async (ref) => ref !== 'trial' });
  assert.deepEqual(lost.experimentalCoverageReceipts, []);
  await assert.rejects(experimentalCoverage.optionsForGrowth(db, {
    experimentalScopeId: 'mission' }), /resolver/);
}

function attempt(family) {
  return { initialState: 'snapshot', hypothesis: 'query', family,
    scale: 'function', evidenceRefs: ['profile'], outcomeStatus: 'VERIFIED_FAILURE',
    verifierId: 'verifier' };
}

async function recordFailure(db, id, contract) {
  return evidenceStore.recordAttempt(db, { attemptId: id, scopeId: 'stuck', contract,
    outcomeRef: `result:${id}`, resolveArtifact: async () => true });
}

async function testSpiral(db) {
  const moduleChange = { ...attempt('schema'), scale: 'module' };
  const input = { attemptScopeId: 'stuck', localEvaluationComplete: true,
    globalCandidates: [{ intervention: moduleChange }] };
  assert.equal((await search.chooseSearchScopePersisted(db, input)).reason, 'SCALE_NOT_AUTHORIZED');
  await recordFailure(db, 'first', attempt('sql'));
  await assert.rejects(recordFailure(db, 'duplicate', attempt('sql')), /ATTEMPT_NOT_DISTINCT/);
  assert.equal((await search.chooseSearchScopePersisted(db, input)).reason, 'SCALE_NOT_AUTHORIZED');
  await recordFailure(db, 'second', attempt('index'));
  const widened = await search.chooseSearchScopePersisted(db, input);
  assert.equal(widened.scope, 'global');
  assert.equal(widened.progression.reason, 'VERIFIED_STAGNATION');
  await assert.rejects(evidenceStore.recordAttempt(db, { attemptId: 'unproven', scopeId: 'other',
    contract: attempt('cache'), outcomeRef: 'missing', resolveArtifact: async () => false }), /must resolve/);
  const replica = { ...attempt('sql'), replicationOf: 'first', independentVerifierId: 'verifier' };
  await assert.rejects(recordFailure(db, 'self-replica', replica), /ATTEMPT_NOT_DISTINCT/);
  await recordFailure(db, 'independent', { ...replica, independentVerifierId: 'other-verifier' });
}

async function testChronotaxis(db) {
  await db.exec('CREATE TABLE ontogenesis_projects (id TEXT PRIMARY KEY)');
  await db.run("INSERT INTO ontogenesis_projects (id) VALUES ('project')");
  await require('../src/db/migrations/migrateOntogenesisSchedule').migrateOntogenesisSchedule(db);
  const anchorMs = Date.parse('2026-10-04T00:00:00.000Z');
  const id = await schedule.createSchedule(db, { id: 'chronotaxis', projectId: 'project',
    kind: 'interval', nowMs: anchorMs, spec: { policy: 'chronotaxis', periodMs: 1000,
      anchorMs, minimumSpacingMs: 0, maximumLatencyMs: 900, offset: 0.2 } });
  const row = await db.get('SELECT next_run_at FROM ontogenesis_schedules WHERE id = ?', [id]);
  const observation = { observationId: 'observed', scheduleId: id, windowIndex: 0,
    status: 'OBSERVED', observedAt: row.next_run_at, evidenceRef: 'probe:receipt' };
  await assert.rejects(schedule.recordTemporalObservation(db, {
    ...observation, resolveArtifact: async () => false }), /resolvable/);
  await assert.rejects(schedule.recordTemporalObservation(db, { ...observation,
    windowIndex: 1, resolveArtifact: async () => true }), /in-window/);
  await schedule.recordTemporalObservation(db, { ...observation, resolveArtifact: async () => true });
  await assert.rejects(schedule.recordTemporalObservation(db, { observationId: 'early',
    scheduleId: id, windowIndex: 1, status: 'MISSED', observedAt: row.next_run_at }), /elapsed/);
  await schedule.recordTemporalObservation(db, { observationId: 'missed', scheduleId: id,
    windowIndex: 1, status: 'MISSED', observedAt: new Date(anchorMs + 2000).toISOString() });
  const coverage = await schedule.temporalCoverage(db, { scheduleId: id });
  assert.equal(coverage.covered, 1);
  assert.equal(coverage.missedWindows, 1);
}

async function testCambium(db) {
  await require('../src/db/migrations/migrateHolobiontSessions').migrateHolobiontSessions(db);
  await require('../src/db/migrations/migrateHolobiontMemory').migrateHolobiontMemory(db);
  const created = await holobiontStore.createSession(db, { hostId: 'host',
    scope: 'MISSION', missionId: 'mission-cambium' });
  const session = await holobiontStore.getSession(db, created.holobiontId);
  const stored = await memory.recordMemory(db, { holobiontId: created.holobiontId,
    expectedSessionRevision: session.revision, memoryType: 'PROCEDURAL',
    procedureVerified: true, content: 'Retry when idempotent.',
    evidenceRefs: ['verification'], authorId: 'independent',
    cambiumContract: { verificationRef: 'verification', environmentVersion: 'v1',
      conditions: ['idempotent'], witnesses: [{ witnessId: 'witness',
        artifactRef: 'artifact:witness', status: 'VERIFIED' }], resolveArtifact: async () => true } });
  await cambium.attachCounterexample(db, { counterexampleId: 'counterexample',
    claimId: stored.memoryId, scopeId: 'MISSION:mission-cambium',
    artifactRef: 'artifact:counterexample', condition: { idempotent: false },
    resolveArtifact: async () => true });
  assert.deepEqual(await memory.recallMemories(db, { holobiontId: created.holobiontId }), []);
  const recalled = await memory.recallMemories(db, { holobiontId: created.holobiontId,
    resolveArtifact: async () => true });
  assert.equal(recalled.length, 1);
  assert.deepEqual(recalled[0].cambium.conditions, ['idempotent']);
  assert.equal(recalled[0].cambium.counterexamples.length, 1);
  assert.deepEqual(await memory.recallMemories(db, { holobiontId: created.holobiontId,
    resolveArtifact: async (ref) => ref !== 'artifact:counterexample' }), []);
  await cambium.commitCompression(db, { claimId: stored.memoryId,
    scopeId: 'MISSION:mission-cambium', removeWitnessIds: ['witness'], degradeClaim: true,
    resolveArtifact: async () => true, compareDecisions: async () => ({ preserved: true }) });
  assert.deepEqual(await memory.recallMemories(db, { holobiontId: created.holobiontId,
    resolveArtifact: async () => true }), []);
}

async function testRisk(db) {
  await risk.createRoot(db, { grantId: 'risk-root', scope: { campaign: 'c' }, units: 100000000 });
  await risk.reserveTest(db, { testId: 'biocenose-test', grantId: 'risk-root',
    units: 10000000, protocolHash: 'sha256:p', evaluationSetId: 'holdout-a' });
  const receipt = statisticalReceipt.issue({ testId: 'biocenose-test', verifierId: 'independent',
    assessmentRef: 'assessment:1', protocolHash: 'sha256:p', evaluationSetId: 'holdout-a',
    observations: Array.from({ length: 12 }, (_, index) =>
      ({ outcome: 1, evidenceRef: `trial:${index}` })) });
  const input = { db, statisticalContract: { testId: 'biocenose-test', receipt } };
  const allowed = { aggregation: { questionType: 'FACTUAL', outcome: 'EVIDENCE_SUPPORTED' },
    gate: { status: 'ALLOWED' } };
  const blocked = await biocenoseGate.applyStatistical(input, {
    ...allowed, gate: { status: 'REVIEW_REQUIRED' } }, { gates: [] });
  assert.equal(blocked.gate.status, 'REVIEW_REQUIRED');
  assert.equal((await db.get('SELECT status FROM morph_risk_tests WHERE test_id = ?', ['biocenose-test'])).status, 'RESERVED');
  const gated = await biocenoseGate.applyStatistical(input, allowed, { gates: [] });
  assert.equal(gated.gate.status, 'ALLOWED');
  assert.equal(gated.gate.statistical.result.eligible, true);
  assert.equal((await risk.grantBalance(db, 'risk-root')).conserved, true);
}

(async () => {
  process.env.GENOS_STATISTICAL_RECEIPT_SECRET = 'phase-two-test-statistical-receipt-secret';
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await migrateMorphogenesisCapabilities(db);
    await testMeristem(db);
    await testSpiral(db);
    await testChronotaxis(db);
    await testCambium(db);
    await testRisk(db);
    console.log('Morphogenesis phase two tests passed.');
  } finally {
    await db.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
