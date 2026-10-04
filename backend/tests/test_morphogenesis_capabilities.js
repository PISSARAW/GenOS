'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMorphogenesisCapabilities } = require('../src/db/migrations/migrateMorphogenesisCapabilities');
const meristem = require('../src/services/morphogenesis/capabilities/epistemicMeristem');
const spiral = require('../src/services/morphogenesis/capabilities/unblockSpiral');
const chronotaxis = require('../src/services/morphogenesis/capabilities/chronotaxis');
const cambium = require('../src/services/morphogenesis/capabilities/cambiumService');
const risk = require('../src/services/morphogenesis/capabilities/riskLedgerService');
const statisticalReceipt = require('../src/services/morphogenesis/capabilities/statisticalReceipt');
const store = require('../src/services/morphogenesis/capabilities/capabilityEvidenceStore');
const growth = require('../src/services/rhizome/growth/growthPlanner');
const search = require('../src/services/morphogenesis/synthesis/morphologySearchPolicy');
const schedules = require('../src/services/ontogenesis/scheduleService');
const holobiontStore = require('../src/services/holobionte/holobiontStore');
const holobiontMemory = require('../src/services/holobionte/memory/symbioticMemoryService');

function experiment(id, outcome, replicationOf = null) {
  return { experimentId: id, hypothesisId: id, verifierId: 'verifier',
    predictions: ['double-delivery'], discriminatingOutcomes: [outcome, 'no-duplicate'],
    dependencies: ['queue'], failureModes: ['retry'], utility: 0.9, cost: 0.1, replicationOf,
    independentVerifierId: replicationOf ? 'independent-verifier' : null };
}

function candidate(id, contract) {
  return { candidateId: id, action: 'SPAWN_WORKER', targetNodeIds: [], expectedUtility: 0.9,
    creationCost: 0.1, coordinationCost: 0, duplicationRisk: 0, sufficient: true,
    evidenceRefs: ['gap-proof'], experimentContract: contract };
}

async function testMeristem(db) {
  const covered = experiment('covered', 'duplicate');
  const novel = experiment('novel', 'other-cause');
  const unverified = [{ status: 'PROPOSED', verifierId: 'v', evidenceRefs: ['r'], experiment: covered }];
  assert.equal(meristem.rankExperiments({ candidates: [covered, novel], coverageReceipts: unverified })[0].experiment.experimentId, 'covered');
  await assert.rejects(store.recordCoverage(db, { receiptId: 'unresolved', scopeId: 'mission',
    status: 'VERIFIED', verifierId: 'verifier', verificationRef: 'missing',
    resolveArtifact: async () => false, evidenceRefs: ['r'], experiment: covered }), /unresolved/);
  await store.recordCoverage(db, { receiptId: 'coverage-1', scopeId: 'mission', status: 'VERIFIED',
    verifierId: 'verifier', verificationRef: 'verification:coverage-1',
    resolveArtifact: async () => true, evidenceRefs: ['r'], experiment: covered });
  const receipts = await store.loadCoverage(db, 'mission');
  assert.equal(meristem.rankExperiments({ candidates: [covered, novel], coverageReceipts: receipts })[0].experiment.experimentId, 'novel');
  assert.equal(meristem.rankExperiments({ candidates: [experiment('replica', 'duplicate', 'covered')],
    coverageReceipts: receipts })[0].inhibition, 0);
  const gap = { needId: 'need', severity: 1, confidence: 1,
    evidence: { evidenceId: 'gap-proof', needId: 'need', graphVersion: 1, diagnosis: { reason: 'CAPABILITY_ABSENT' } } };
  const planned = growth.plan({ session: { graphVersion: 1, budgets: { growth: 3 } }, gap,
    values: [candidate('covered', covered), candidate('novel', novel)],
    options: { experimentalCoverageReceipts: receipts } });
  assert.equal(planned.candidate.candidateId, 'novel');
}

async function testSpiral(db) {
  const first = { initialState: 's', hypothesis: 'h', family: 'sql', scale: 'function', evidenceRefs: ['e1'] };
  const changed = { ...first, family: 'index' };
  await store.recordAttempt(db, { attemptId: 'attempt-1', scopeId: 'mission', contract: first });
  const attempts = await store.loadAttempts(db, 'mission');
  assert.equal(spiral.planNext({ attempts, candidates: [first] }).permitted, false);
  assert.equal(spiral.planNext({ attempts, candidates: [changed] }).permitted, true);
  assert.equal(search.chooseSearchScope({ attemptHistory: attempts, localEvaluationComplete: true,
    evaluatedLocalMutations: [{ valid: true, intervention: first }],
    globalCandidates: [{ intervention: changed }] }).candidates.length, 1);
  assert.equal(search.chooseSearchScope({ attemptHistory: attempts, localEvaluationComplete: true,
    evaluatedLocalMutations: [{ valid: true, intervention: first }],
    globalCandidates: [{ intervention: changed }] }).scope, 'global');
}

async function testChronotaxis(db) {
  await db.exec('CREATE TABLE ontogenesis_projects (id TEXT PRIMARY KEY)');
  await db.run("INSERT INTO ontogenesis_projects(id) VALUES ('project')");
  await require('../src/db/migrations/migrateOntogenesisSchedule').migrateOntogenesisSchedule(db);
  const anchorMs = Date.parse('2026-10-04T00:00:00.000Z');
  const spec = { policy: 'chronotaxis', periodMs: 1000, anchorMs,
    minimumSpacingMs: 0, maximumLatencyMs: 900, offset: 0.2 };
  const id = await schedules.createSchedule(db, { id: 'phase', projectId: 'project', kind: 'interval',
    spec, nowMs: anchorMs });
  const first = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [id]);
  assert.equal(first.kind, 'interval');
  assert.equal(first.next_run_at, chronotaxis.nextObservation({ ...spec, index: 0 }, anchorMs).scheduledAt);
  const ran = await schedules.markScheduleRan(db, { id, nowMs: Date.parse(first.next_run_at) });
  assert.equal(ran.firedWindowIndex, 0);
  await schedules.recordTemporalObservation(db, { observationId: 'observation', scheduleId: id,
    windowIndex: 0, status: 'OBSERVED', observedAt: first.next_run_at, evidenceRef: 'probe:1',
    resolveArtifact: async () => true });
  assert.equal((await schedules.temporalCoverage(db, { scheduleId: id })).covered, 1);
  assert.equal(chronotaxis.coverage([{ status: 'MISSED', observedAt: first.next_run_at }],
    { periodMs: 1000, anchorMs }).covered, 0);
}

async function testCambium(db) {
  const scopeId = 'PROJECT:demo';
  const resolveArtifact = async () => true;
  await assert.rejects(cambium.registerProcedure(db, { claimId: 'unresolved', scopeId,
    procedure: 'retry', verificationRef: 'missing', environmentVersion: 'v1',
    conditions: ['idempotent'], witnesses: [{ witnessId: 'w0', artifactRef: 'artifact:0', status: 'VERIFIED' }],
    resolveArtifact: async () => false }), /unresolved/);
  await cambium.registerProcedure(db, { claimId: 'retry', scopeId, procedure: 'retry on timeout',
    verificationRef: 'verification:retry', environmentVersion: 'v1', conditions: ['idempotent'],
    witnesses: [{ witnessId: 'w1', artifactRef: 'artifact:1', status: 'VERIFIED' }], resolveArtifact });
  await cambium.attachCounterexample(db, { counterexampleId: 'counter:1', claimId: 'retry', scopeId,
    artifactRef: 'artifact:2', condition: { idempotent: false }, resolveArtifact });
  const compareDecisions = async () => ({ preserved: true });
  assert.equal((await cambium.evaluateCompression(db, { claimId: 'retry', scopeId, removeWitnessIds: ['w1'],
    resolveArtifact, compareDecisions })).reason, 'LAST_WITNESS_REQUIRED');
  assert.equal((await cambium.evaluateCompression(db, { claimId: 'retry', scopeId,
    resolveArtifact: async () => false, compareDecisions })).reason, 'ARTIFACT_UNRESOLVABLE');
  await assert.rejects(db.run("DELETE FROM morph_cambium_counterexamples WHERE counterexample_id = 'counter:1'"));
  const result = await cambium.commitCompression(db, { claimId: 'retry', scopeId, removeWitnessIds: ['w1'],
    degradeClaim: true, resolveArtifact, compareDecisions });
  assert.equal(result.nextStatus, 'UNVERIFIED');
  assert.equal((await db.get("SELECT status FROM morph_cambium_claims WHERE claim_id = 'retry'")).status, 'UNVERIFIED');
}

async function testHolobiontCambium(db) {
  await require('../src/db/migrations/migrateHolobiontSessions').migrateHolobiontSessions(db);
  await require('../src/db/migrations/migrateHolobiontMemory').migrateHolobiontMemory(db);
  const created = await holobiontStore.createSession(db, { hostId: 'host-cambium',
    scope: 'MISSION', missionId: 'mission-cambium' });
  const session = await holobiontStore.getSession(db, created.holobiontId);
  const result = await holobiontMemory.recordMemory(db, {
    holobiontId: created.holobiontId, expectedSessionRevision: session.revision,
    memoryType: 'PROCEDURAL', procedureVerified: true, content: 'Retry only when idempotent.',
    evidenceRefs: ['receipt:procedure'], authorId: 'independent',
    cambiumContract: { verificationRef: 'receipt:procedure', environmentVersion: 'v1',
      conditions: ['idempotent'], witnesses: [{ witnessId: 'w:memory',
        artifactRef: 'artifact:memory', status: 'VERIFIED' }], resolveArtifact: async () => true }
  });
  assert.equal(result.memoryType, 'PROCEDURAL');
  const claim = await db.get('SELECT scope_id FROM morph_cambium_claims WHERE claim_id = ?', [result.memoryId]);
  assert.equal(claim.scope_id, 'MISSION:mission-cambium');
}

async function testRisk(db) {
  await risk.createRoot(db, { grantId: 'root', ownerNodeId: 'trinity', scope: { campaign: 'c' }, units: 100000000 });
  await risk.splitGrant(db, { parentId: 'root', children: [
    { grantId: 'left', ownerNodeId: 'world-1', units: 20000000 },
    { grantId: 'right', ownerNodeId: 'world-2', units: 30000000 }
  ] });
  await risk.reserveTest(db, { testId: 'test-1', grantId: 'left', units: 10000000,
    protocolHash: 'sha256:p', evaluationSetId: 'holdout' });
  await assert.rejects(risk.reserveTest(db, { testId: 'reused-set', grantId: 'right', units: 1000000,
    protocolHash: 'sha256:other', evaluationSetId: 'holdout' }));
  const receipt = statisticalReceipt.issue({ testId: 'test-1', verifierId: 'independent',
    assessmentRef: 'scientific-assessment:1', protocolHash: 'sha256:p',
    evaluationSetId: 'holdout', observations: Array.from({ length: 12 }, (_, i) =>
      ({ outcome: 1, evidenceRef: `trial:${i}` })) });
  assert.ok(receipt.pValue < 0.01);
  await assert.rejects(risk.finalizeTest(db, { testId: 'test-1', receipt: { ...receipt, pValue: 0 } }),
    /VALID_STATISTICAL_RECEIPT_REQUIRED/);
  assert.equal((await risk.finalizeTest(db, { testId: 'test-1', receipt })).eligible, true);
  assert.equal((await risk.finalizeTest(db, { testId: 'test-1', receipt })).idempotent, true);
  await risk.reserveTest(db, { testId: 'test-2', grantId: 'right', units: 10000000,
    protocolHash: 'sha256:p2', evaluationSetId: 'holdout-2' });
  const losing = statisticalReceipt.issue({ testId: 'test-2', verifierId: 'independent',
    assessmentRef: 'scientific-assessment:2', protocolHash: 'sha256:p2',
    evaluationSetId: 'holdout-2', observations: [{ outcome: 0, evidenceRef: 'trial:losing' }] });
  assert.equal((await risk.finalizeTest(db, { testId: 'test-2', receipt: losing })).eligible, false);
  await risk.mergeOwnership(db, { grantIds: ['left', 'right'], newOwnerNodeId: 'merged' });
  assert.equal((await risk.grantBalance(db, 'root')).conserved, true);
  assert.equal((await risk.grantBalance(db, 'left')).conserved, true);
  assert.equal((await risk.grantBalance(db, 'right')).conserved, true);
  await assert.rejects(risk.reserveTest(db, { testId: 'too-much', grantId: 'left', units: 20000000,
    protocolHash: 'sha256:p2', evaluationSetId: 'holdout-2' }), /RISK_BUDGET_EXHAUSTED/);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM morph_risk_events')).n, 7);
}

(async () => {
  process.env.GENOS_STATISTICAL_RECEIPT_SECRET = 'test-only-statistical-receipt-secret-123456789';
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await migrateMorphogenesisCapabilities(db);
    await migrateMorphogenesisCapabilities(db);
    await testMeristem(db);
    await testSpiral(db);
    await testChronotaxis(db);
    await testCambium(db);
    await testHolobiontCambium(db);
    await testRisk(db);
    console.log('Morphogenesis capability tests passed.');
  } finally {
    await db.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
