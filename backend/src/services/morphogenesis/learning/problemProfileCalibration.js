'use strict';

const { digest } = require('../../biologicalIntegrity');
const {
  PROFILE_DIMENSIONS,
  validateProblemMorphologyProfile
} = require('../profiling/problemMorphologyProfiler');
const outcomeEvidenceValidation = require('./outcomeEvidenceValidation');

const PROFILE_EVIDENCE_KIND = 'verified_19d_profile';

function isProblemProfile(profile) {
  return profile?.profileVersion === 2 && Boolean(profile.dimensions);
}

function problemProfileDigest(profile) {
  return `sha256:${digest(profile)}`;
}

function dimensionIsUsable(item) {
  return Number.isFinite(item?.value) && item.confidence > 0
    && Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0;
}

function profileVector(profile) {
  if (!isProblemProfile(profile)) return null;
  if (!validateProblemMorphologyProfile(profile).valid) return null;
  const dimensions = PROFILE_DIMENSIONS.map((name) => profile.dimensions[name]);
  if (!dimensions.every(dimensionIsUsable)) return null;
  return dimensions.map((item) => item.value);
}

function verifiedProfileBinding(profile, evidence) {
  const vector = profileVector(profile);
  if (!vector || !outcomeEvidenceValidation.validateLearningEvidence(evidence)) return null;
  const context = evidence.learningContext;
  const profileDigest = problemProfileDigest(profile);
  if (context.problemProfileSha256 !== profileDigest) return null;
  if (problemProfileDigest(context.problemProfile) !== profileDigest) return null;
  return { vector, profileDigest, evidenceKind: PROFILE_EVIDENCE_KIND };
}

function profileSimilarity(left, right) {
  if (!Array.isArray(left) || left.length !== PROFILE_DIMENSIONS.length) return 0;
  if (!Array.isArray(right) || right.length !== PROFILE_DIMENSIONS.length) return 0;
  const distance = left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0);
  return Math.max(0, 1 - distance / PROFILE_DIMENSIONS.length);
}

module.exports = {
  PROFILE_EVIDENCE_KIND,
  isProblemProfile,
  problemProfileDigest,
  profileVector,
  verifiedProfileBinding,
  profileSimilarity
};
