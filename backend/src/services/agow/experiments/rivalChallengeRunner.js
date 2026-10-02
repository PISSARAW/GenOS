'use strict';

const { randomUUID } = require('node:crypto');
const registryFactory = require('./rivalChallengeRegistry');
const matcher = require('./rivalControlMatcher');
const nursery = require('../../gvxExperimentalNursery');

function buildArm(input) {
  const { seed, role, challenge } = input;
  const strategy = strategyFor(challenge, role);
  const suffix = `${challenge.challenge}-${seed}-${role}`;
  return { armId: suffix, role,
    worldId: `world-${randomUUID()}`, isolationId: `isolation-${randomUUID()}`,
    snapshotHash: input.snapshotHash, strategyId: String(strategy.id || role), budget: input.worldBudget,
    seed: String(seed), strategy };
}

function strategyFor(challenge, role) {
  if (role === 'baseline') return challenge.baseline;
  if (role === 'candidate' || role === 'treatment') return challenge.treatment;
  return (challenge.topologyProfile.controls || []).find((entry) => entry.id === role);
}

function controlsFor(challenge) {
  return { model: challenge.modelLock.id, toolsetHash: challenge.toolLock.hash,
    environmentHash: matcher.digest(challenge.topologyProfile), topologyProfile: challenge.topologyProfile,
    verifierProfile: challenge.verifierProfile, modelLockHash: matcher.digest(challenge.modelLock),
    toolLockHash: matcher.digest(challenge.toolLock), budgetHash: matcher.digest(challenge.budget) };
}

function matchedControls(options) {
  const controls = controlsFor(options.challenge);
  if (!options.datasetManifest) return controls;
  return { ...controls, datasetId: options.datasetManifest.datasetId,
    datasetVersion: options.datasetManifest.version, datasetSourceHash: options.datasetManifest.sourceFingerprint,
    caseCorpusHash: matcher.digest(options.cases.map((item) => ({ caseId: item.caseId, input: item.input }))) };
}

async function createMatchedWorld(options) {
  const world = await options.createIsolatedWorld({ ...options.context, locks: {
    modelLockHash: matcher.digest(options.challenge.modelLock),
    toolLockHash: matcher.digest(options.challenge.toolLock),
    budgetHash: matcher.digest(options.challenge.budget)
  } });
  const controls = world?.controlManifest;
  if (!controls || controls.modelLockHash !== matcher.digest(options.challenge.modelLock)
    || controls.toolLockHash !== matcher.digest(options.challenge.toolLock)
    || controls.budgetHash !== matcher.digest(options.challenge.budget)) {
    throw new Error('rival-challenge-world-lock-mismatch');
  }
  return world;
}

async function runSeed(options) {
  const { challenge, seed } = options;
  const roles = ['baseline', 'candidate', ...(challenge.topologyProfile.controls || []).map((item) => item.id)];
  const arms = roles.map((role) => buildArm({ role, challenge,
    seed, snapshotHash: options.snapshotHash, worldBudget: challenge.budget.world }));
  return nursery.run({ db: options.db, scope: options.scope, entityId: options.entityId,
    snapshotHash: options.snapshotHash, worldBudget: challenge.budget.world,
    controls: matchedControls(options), verifierRequirements: challenge.verifierProfile.requirements,
    metricAllowlist: challenge.metrics,
    experimentDesign: { type: arms.length === 2 ? 'paired' : 'multi_arm', arms }, verifierRegistry: options.verifierRegistry,
    artifactReader: options.artifactReader,
    createIsolatedWorld: (context) => createMatchedWorld({ context, challenge, createIsolatedWorld: options.createIsolatedWorld }),
    runWorld: (worldContext) => options.runArm({ ...worldContext, seed,
      challengeId: challenge.challenge, metrics: challenge.metrics, ablations: challenge.ablations,
      cases: options.cases || [], datasetManifest: options.datasetManifest || null }) });
}

async function run(options) {
  if (!options?.registry || typeof options.registry.get !== 'function') throw new Error('rival-challenge-registry-required');
  const challenge = options.registry.get(options.challenge);
  if (!challenge) throw new Error('rival-challenge-not-registered');
  registryFactory.validate(challenge);
  matcher.validate({ ...challenge, baseline: locks(challenge), treatment: locks(challenge) });
  const results = [];
  for (const seed of challenge.seeds) results.push(await runSeed({ ...options, challenge, seed }));
  return { challenge: challenge.challenge, seeds: challenge.seeds, controlMatch: true,
    experiments: results.map((item) => item.experimentId), assessments: results.map((item) => item.assessment),
    outcomes: results.flatMap((item) => item.outcomes || []),
    datasetManifest: options.datasetManifest || null,
    promotionAllowed: false, status: 'nursery_review_required' };
}

function locks(challenge) {
  return { modelLock: challenge.modelLock, toolLock: challenge.toolLock, budget: challenge.budget };
}

module.exports = { run, buildArm, controlsFor, matchedControls, createMatchedWorld, strategyFor };
