'use strict';

const fs = require('fs');
const path = require('path');
const { PolicyLearner, MIN_SAMPLES_FOR_BANDIT } = require('./policyLearner');
const outcomeEvidenceValidation = require('./outcomeEvidenceValidation');
const profileCalibration = require('./problemProfileCalibration');

const topologyPolicy = new PolicyLearner({
  actionSpace: ['trinity', 'a_team', 'syncytium', 'rhizome', 'biome', 'biocenose', 'holobionte', 'metapopulation'],
  minSamplesForBandit: MIN_SAMPLES_FOR_BANDIT
});
const PRIOR_STRENGTH = 8;
const MIN_PROFILE_SAMPLES = 10;
const MIN_PROFILE_SIMILARITY = 0.75;
const MAX_OBSERVATIONS = 5000;
const observations = [];
let persistenceError = null;

restoreObservations();

function contextFor(profile = {}) {
  return {
    problemType: String(profile.domain || profile.problemType || 'general'),
    complexity: complexityBand(profile.complexity)
  };
}

function complexityBand(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 'unknown';
  if (score < 0.34) return 'low';
  if (score < 0.67) return 'medium';
  return 'high';
}

function recordVerifiedOutcome(input = {}) {
  const topology = String(input.topology || '');
  if (!admissibleInput(topology, input.outcomeEvidence)) return false;
  const profileBinding = profileCalibration.verifiedProfileBinding(input.profile, input.outcomeEvidence);
  if (profileCalibration.isProblemProfile(input.profile) && !profileBinding) return false;
  const score = verifiedReward(input.outcomeEvidence);
  const observation = {
    topology, profile: contextFor(input.profile), score: Math.max(0, Math.min(1, score)),
    cost: Number(input.cost) || 0, latency: Number(input.latency) || 0,
    receiptId: input.outcomeEvidence.receiptId,
    evidenceKind: input.outcomeEvidence.kind,
    outcomeEvidence: input.outcomeEvidence,
    profileVector: profileBinding?.vector || null,
    profileDigest: profileBinding?.profileDigest || null,
    timestamp: new Date().toISOString()
  };
  observations.push(observation);
  if (observations.length > MAX_OBSERVATIONS) observations.shift();
  applyObservation(observation);
  persistObservations();
  return true;
}

function admissibleInput(topology, evidence) {
  if (!topologyPolicy.actionSpace.includes(topology)) return false;
  return outcomeEvidenceValidation.validate(evidence);
}

function verifiedReward(evidence) {
  return evidence.success ? Number(evidence.value) : 0;
}

function applyObservation(item) {
  topologyPolicy.recordOutcome(item.topology, item.profile, item.score, item.cost, item.latency);
}

function observationPath() {
  if (process.env.GENOS_MORPHOLOGY_POLICY_PATH) return path.resolve(process.env.GENOS_MORPHOLOGY_POLICY_PATH);
  const { PATHS } = require('../../../storage/storagePaths');
  return path.join(PATHS.operational, 'morphology-policy.json');
}

function restoreObservations() {
  try {
    const file = observationPath();
    if (!fs.existsSync(file)) return;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.schemaVersion !== 1 || !Array.isArray(saved.observations)) return;
    for (const item of saved.observations.slice(-MAX_OBSERVATIONS)) {
      if (!validStoredObservation(item)) continue;
      const restored = restoreObservation(item);
      if (!restored) continue;
      observations.push(restored);
      applyObservation(restored);
    }
  } catch (error) {
    persistenceError = error.message;
  }
}

function validStoredObservation(item) {
  if (!topologyPolicy.actionSpace.includes(item.topology)) return false;
  if (!Number.isFinite(Number(item.score))) return false;
  if (!outcomeEvidenceValidation.validate(item.outcomeEvidence)) return false;
  return Number(item.score) === verifiedReward(item.outcomeEvidence);
}

function restoreObservation(item) {
  const profile = item.outcomeEvidence?.learningContext?.problemProfile;
  if (!profileCalibration.isProblemProfile(profile)) {
    return { ...item, profileVector: null, profileDigest: null };
  }
  const binding = profileCalibration.verifiedProfileBinding(profile, item.outcomeEvidence);
  return binding ? { ...item, profileVector: binding.vector, profileDigest: binding.profileDigest } : null;
}

function persistObservations() {
  try {
    const file = observationPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, observations }, null, 2));
    fs.renameSync(temporary, file);
    persistenceError = null;
  } catch (error) {
    persistenceError = error.message;
  }
}

function priorFor(topology, profile) {
  if (profileCalibration.isProblemProfile(profile)) return profilePriorFor(topology, profile);
  const key = topologyPolicy.priorService.contextToKey({ ...contextFor(profile), topology });
  const outcome = topologyPolicy.priorService.priors.get('outcome')?.get(key);
  const cost = topologyPolicy.priorService.priors.get('cost')?.get(key);
  return {
    expectedOutcome: outcome ? topologyPolicy.priorService.getPrior(key, 'outcome').mean : 0.5,
    samples: outcome?.count || 0,
    expectedCost: cost ? topologyPolicy.priorService.getPrior(key, 'cost').mean : 0,
    evidenceKind: 'legacy_context', calibrationStatus: outcome ? 'legacy_observed' : 'unavailable'
  };
}

function profilePriorFor(topology, profile) {
  const vector = profileCalibration.profileVector(profile);
  if (!vector) return emptyProfilePrior('invalid_profile');
  const matches = observations.filter((item) => item.topology === topology && item.profileVector)
    .map((item) => ({ item, weight: profileCalibration.profileSimilarity(vector, item.profileVector) }))
    .filter((entry) => entry.weight >= MIN_PROFILE_SIMILARITY);
  if (!matches.length) return emptyProfilePrior('unavailable');
  const totalWeight = matches.reduce((sum, entry) => sum + entry.weight, 0);
  const weighted = (field) => matches.reduce((sum, entry) => sum + Number(entry.item[field] || 0) * entry.weight, 0) / totalWeight;
  return {
    expectedOutcome: weighted('score'), expectedCost: weighted('cost'), samples: matches.length,
    evidenceKind: profileCalibration.PROFILE_EVIDENCE_KIND,
    calibrationStatus: matches.length >= MIN_PROFILE_SAMPLES ? 'calibrated' : 'warming_up'
  };
}

function emptyProfilePrior(status) {
  return {
    expectedOutcome: 0.5, expectedCost: 0, samples: 0,
    evidenceKind: profileCalibration.PROFILE_EVIDENCE_KIND, calibrationStatus: status
  };
}

function blendScore({ topology, profile, heuristicScore, range }) {
  const prior = priorFor(topology, profile);
  const [minimum, maximum] = range;
  const heuristic = maximum > minimum ? (heuristicScore - minimum) / (maximum - minimum) : 0.5;
  const totalSamples = topologyPolicy.actionSpace.reduce((sum, action) => sum + priorFor(action, profile).samples, 0);
  const profileStatus = profileCalibration.isProblemProfile(profile)
    ? (totalSamples >= MIN_PROFILE_SAMPLES ? 'calibrated' : (totalSamples > 0 ? 'warming_up' : prior.calibrationStatus))
    : prior.calibrationStatus;
  const mayInfluence = !profileCalibration.isProblemProfile(profile) || profileStatus === 'calibrated';
  const learnedWeight = mayInfluence ? totalSamples / (totalSamples + PRIOR_STRENGTH) : 0;
  const exploration = totalSamples >= MIN_SAMPLES_FOR_BANDIT
    ? Math.min(0.25, 0.1 * Math.sqrt(Math.log(totalSamples + 1) / Math.max(1, prior.samples))) : 0;
  const score = heuristic * (1 - learnedWeight) + Math.min(1, prior.expectedOutcome + exploration) * learnedWeight;
  return {
    score: Number(score.toFixed(6)), samples: prior.samples,
    learnedWeight: Number(learnedWeight.toFixed(4)),
    evidenceKind: prior.evidenceKind, calibrationStatus: profileStatus
  };
}

module.exports = {
  recordVerifiedOutcome, priorFor, blendScore, contextFor, PRIOR_STRENGTH,
  MIN_PROFILE_SAMPLES, observationPath,
  getStatus: () => ({ observations: observations.length, persistenceError })
};
