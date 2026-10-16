'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const maturity = require('../src/services/metapopulation/policy/metapopulationVariantMaturity');
const policyService = require('../src/services/metapopulation/policy/metapopulationPolicyService');
const variantRuntime = require('../src/services/metapopulation/policy/variantRuntimeService');
const catalog = require('../src/services/morphogenesis/registry/variantCatalog');
const ranking = require('../src/services/morphogenesis/adaptiveTopologyRanking');
const migrationLoop = require('../src/services/metapopulation/runtime/regionalMigrationLoopService');
const nested = require('../src/services/metapopulation/evolution/nestedTopologyService');
const brain = require('../src/services/metapopulation/runtime/regionalBrainService');
const coordination = require('../src/services/metapopulationCoordinationService');

const VARIANTS = Object.keys(policyService.VARIANTS);

function maturityChecks() {
  assert.equal(VARIANTS.length, 16);
  for (const variant of VARIANTS) {
    assert.equal(maturity.maturityForVariant(variant), 'implemented', variant);
    assert.deepEqual(maturity.describeVariantProof(variant).missingHandlers, [], variant);
  }
}

function catalogChecks() {
  const entries = catalog.topologyVariants('metapopulation');
  assert.equal(entries.length, 16);
  for (const entry of entries) {
    assert.equal(entry.maturity, 'implemented', entry.variantId);
  }
}

function candidateFor(variant) {
  return { id: `meta-${variant}`, topology: 'metapopulation', variant,
    maturity: 'implemented', requiredCapabilities: [], workerKinds: [],
    estimatedTokens: 10, coordinationCost: 0.3, estimatedProblemFit: 0.8,
    operationalFit: 0.8, confidence: 0.9, calibrationStatus: 'calibrated' };
}

function rankingChecks() {
  for (const variant of VARIANTS) {
    rankingCheck(variant);
  }
}

function rankingCheck(variant) {
  const result = ranking.rankAdaptiveTopologies({ budget: { tokens: 1000 }, candidates: [candidateFor(variant)] });
  const entry = result.candidates.find((item) => item.variant === variant);
  assert.ok(entry, variant);
  assert.equal(entry.eligible, true, variant);
  assert.equal(entry.proposalEligible, true, variant);
}

function plannerInput(sessionId) {
  return { metapopulationId: sessionId, limit: 5, roleHistory: [], islandElites: [],
    islandSearchRequests: [], evolutionRequests: [], migrationHistoryByPair: [],
    migrationCandidates: [], culturalTransfers: [], culturalMutations: [],
    discoveredPatches: [], presentPatchIds: [], stagedFounders: [], founderCandidates: [],
    prePositionedFounders: [], interMissionMigrations: [], crossRegionContracts: [],
    receiverAttestations: [], errorVectors: {}, receiver: { agentId: 'maturity-probe' }, receivers: {} };
}

async function seedDeme(db, sessionId, suffix) {
  await coordination.createPatch(sessionId, { patchId: `patch-${suffix}`,
    environment: {}, requirements: [], resources: {}, carryingCapacity: 2, quality: 0.8, accessibility: 0.8 }, { db });
  await coordination.createDeme(sessionId, { demeId: `deme-${suffix}`, patchId: `patch-${suffix}`,
    fitness: { score: 0.9 }, localStrategies: [`strategy-${suffix}`] }, { db });
  await coordination.transitionDeme({ sessionId, demeId: `deme-${suffix}`, status: 'ESTABLISHING' }, { db });
  await coordination.transitionDeme({ sessionId, demeId: `deme-${suffix}`, status: 'ACTIVE' }, { db });
}

async function seedSession(db, variant, tag) {
  const session = await coordination.createMetapopulationSession(`Exercer le variant ${variant} (${tag}).`, { db, variant });
  const sessionId = session.metapopulationId;
  assert.equal(session.variant, variant);
  await seedDeme(db, sessionId, `${tag}-${variant}-a`);
  await seedDeme(db, sessionId, `${tag}-${variant}-b`);
  return sessionId;
}

async function plannerChecks(db) {
  for (const variant of VARIANTS) {
    await plannerCheck(db, variant);
  }
}

async function plannerCheck(db, variant) {
  const sessionId = await seedSession(db, variant, 'plan');
  const observed = await brain.observeRegion({ metapopulationId: sessionId }, { db });
  assert.equal(observed.variant, variant);
  const actions = await variantRuntime.executeVariantActions({ variant, observed,
    input: plannerInput(sessionId), options: { db } });
  assert.ok(Array.isArray(actions), variant);
}

async function runtimeCycleChecks(db) {
  for (const variant of VARIANTS) {
    await runtimeCycleCheck(db, variant);
  }
}

async function runtimeCycleCheck(db, variant) {
  const sessionId = await seedSession(db, variant, 'cycle');
  const result = await coordination.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
  assert.ok(['LIMIT_REACHED', 'NO_ACTION'].includes(result.status), `${variant}:${result.status}`);
  assert.ok(['VERIFIED', 'NO_ACTION'].includes(result.cycles[0]?.status), variant);
  assert.equal(result.cycles[0].status === 'HALTED', false, variant);
}

function failClosedMigrationCheck() {
  const adapters = require('../src/services/metapopulation/migration/migrationAdapterRegistry');
  adapters.clearAdapter('STRATEGY');
  const observed = { variant: 'balanced', variantPolicy: policyService.VARIANTS.balanced,
    demes: [{ demeId: 'deme-a', status: 'ACTIVE' }, { demeId: 'deme-b', status: 'ACTIVE' }],
    patches: [], corridors: [{ corridorId: 'c1', sourceDemeId: 'deme-a', targetDemeId: 'deme-b',
      enabled: true, capacity: 1 }] };
  const candidate = { propaguleId: 'unroutable-1', type: 'STRATEGY', sourceDemeId: 'deme-a',
    targetDemeId: 'deme-b', payloadRef: 'strategy-1', migrationReason: 'complementary',
    lineageRefs: ['lin-1'], sourceEvidence: [], provenance: { source: 'maturity-probe' },
    expectedReceiverGain: 0.2, sourceFitness: 0.9, novelty: 0.7 };
  const action = migrationLoop.candidateAction(candidate, { receiver: { agentId: 'receiver' }, reason: 'complementary' }, observed);
  assert.equal(action, null);
}

async function nestedFailClosedCheck() {
  const result = await nested.executeNestedTransition({ demeId: 'd1',
    plan: { transitionRequested: true },
    context: { regionalTopology: 'metapopulation',
      graph: { scope: 'deme', demeId: 'd1', topology: 'single_agent' },
      patch: { demeId: 'd1', targetTopology: 'a_team' } },
    adapters: {} });
  assert.equal(result.committed, false);
  assert.ok(result.errors.length > 0);
}

async function federatedRejectCheck(db) {
  const sessionId = await seedSession(db, 'federated', 'reject');
  const observed = await brain.observeRegion({ metapopulationId: sessionId }, { db });
  const input = { ...plannerInput(sessionId), migrationCandidates: [{ propaguleId: 'fed-1',
    sourceRegion: 'region-a', targetRegion: 'region-b', fields: ['a'] }] };
  const actions = await variantRuntime.executeVariantActions({ variant: 'federated', observed, input, options: { db } });
  assert.ok(actions.some((action) => action.type === 'REJECT_FEDERATED_TRANSFER'), 'sovereignty rejects contract-less transfer');
}

async function budgetExhaustionCheck(db) {
  const sessionId = await seedSession(db, 'balanced', 'budget');
  const result = await coordination.runAutonomousRegionalRuntime({ metapopulationId: sessionId,
    maxCycles: 1, stopConditions: { remainingBudget: 0 } }, { db });
  assert.equal(result.status, 'STOPPED');
  assert.equal(result.reason, 'BUDGET_EXHAUSTED');
}

async function resumeAndRecolonizationCheck(db) {
  const sessionId = await seedSession(db, 'classic_patch', 'resume');
  await coordination.transitionDeme({ sessionId, demeId: 'deme-resume-classic_patch-a', status: 'AT_RISK' }, { db });
  await coordination.transitionDeme({ sessionId, demeId: 'deme-resume-classic_patch-a', status: 'COLLAPSED' }, { db });
  const first = await coordination.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
  assert.equal(first.cycles[0].status, 'VERIFIED');
  const second = await coordination.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1, resume: true,
    candidateLineages: [{ lineageId: 'founder-a', patchIds: ['patch-resume-classic_patch-a'] },
      { lineageId: 'founder-b', patchIds: ['patch-resume-classic_patch-a'] }] }, { db });
  assert.equal(second.cycles[0].status, 'VERIFIED');
  assert.equal(second.cycles[0].cycle, 2);
  assert.equal(second.cycles[0].seed, first.cycles[0].seed);
  const rows = await db.all('SELECT status FROM metapopulation_colonizations WHERE metapopulation_id = ? AND patch_id = ?',
    sessionId, 'patch-resume-classic_patch-a');
  assert.ok(rows.some((row) => row.status === 'IN_TRIAL'), 'founder trial started after extinction');
}

async function testDatabase() {
  const database = require('../src/db');
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'all-variants-maturity-password';
  process.env.GENOS_AGENT_GIT_SIGNING_SECRET ||= 'all-variants-maturity-secret';
  const dbPath = path.join(os.tmpdir(), `genos-all-variants-${process.pid}-${Date.now()}.db`);
  const db = await database.getDatabase(dbPath);
  return { database, db, dbPath };
}

async function closeDatabase(state) {
  try {
    await state.database.closeDatabase();
  } catch (_) {
    // Best-effort cleanup; the OS reclaims temp files.
  }
  await fs.rm(state.dbPath, { force: true }).catch(() => {});
  await fs.rm(`${state.dbPath}-wal`, { force: true }).catch(() => {});
  await fs.rm(`${state.dbPath}-shm`, { force: true }).catch(() => {});
}

async function run() {
  maturityChecks();
  catalogChecks();
  rankingChecks();
  failClosedMigrationCheck();
  await nestedFailClosedCheck();
  const state = await testDatabase();
  try {
    await plannerChecks(state.db);
    await runtimeCycleChecks(state.db);
    await federatedRejectCheck(state.db);
    await budgetExhaustionCheck(state.db);
    await resumeAndRecolonizationCheck(state.db);
  } finally {
    await closeDatabase(state);
  }
  console.log('Metapopulation all variants maturity (16/16 implemented): PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
