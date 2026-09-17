'use strict';

const DIMENSIONS = Object.freeze([
  'unity',
  'coherence',
  'purposiveness',
  'communicability',
  'disinterestedPleasure'
]);

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function dimensionProfile(subject) {
  return Object.fromEntries(DIMENSIONS.map((name) => [name, clamp(subject[name])]));
}

function observedCount(profile) {
  return Object.values(profile).filter((value) => value !== null).length;
}

function confidenceFromCount(count, total) {
  return Number((count / total).toFixed(2));
}

function statusFromCount(count, total) {
  if (count === total) return 'supported';
  if (count > 0) return 'underdetermined';
  return 'not_observed';
}

function baseResult(concept, profile) {
  const count = observedCount(profile);
  return {
    concept,
    profile,
    observedDimensions: count,
    dimensionCount: DIMENSIONS.length,
    status: statusFromCount(count, DIMENSIONS.length),
    confidence: confidenceFromCount(count, DIMENSIONS.length),
    uncertainty: Number((1 - confidenceFromCount(count, DIMENSIONS.length)).toFixed(2)),
    provenance: { source: 'provided_subject_features', philosophicalStatus: 'interpretive' },
    evidenceRequired: count === DIMENSIONS.length ? [] : ['formal_or_contextual_observations']
  };
}

function evaluateBeauty(args = {}) {
  const subject = objectOrEmpty(args.subject || args.work || args);
  const profile = dimensionProfile(subject);
  return {
    ...baseResult('aesthetics.beauty', profile),
    framework: ['platonic_ideal_form', 'kantian_disinterested_judgment'],
    criteria: DIMENSIONS,
    universalValidity: subject.universalValidity === true ? 'claimed_not_proven' : 'not_inferred',
    purposivenessWithoutPurpose: subject.purposivenessWithoutPurpose === true
  };
}

function evaluateSublime(args = {}) {
  const subject = objectOrEmpty(args.subject || args.work || args);
  const mathematical = clamp(subject.magnitude || subject.scale);
  const dynamical = clamp(subject.force || subject.power);
  const terror = clamp(subject.terror || subject.fear);
  const representability = clamp(subject.representability);
  const modes = [];
  if (mathematical !== null && mathematical >= 0.5) modes.push('mathematical');
  if (dynamical !== null && dynamical >= 0.5) modes.push('dynamical');
  return {
    concept: 'aesthetics.sublime',
    framework: ['kantian_mathematical', 'kantian_dynamical', 'burkean_terror', 'lyotardian_unpresentable'],
    modes,
    mathematicalMagnitude: mathematical,
    dynamicalPower: dynamical,
    terror,
    representability,
    imaginativeLimit: representability === null ? null : Number((1 - representability).toFixed(2)),
    status: modes.length ? 'candidate' : 'not_observed',
    confidence: modes.length ? 0.5 : 0,
    uncertainty: modes.length ? 0.5 : 1,
    provenance: { source: 'provided_sublime_features', philosophicalStatus: 'interpretive' },
    evidenceRequired: modes.length ? [] : ['magnitude_or_force_observation']
  };
}

function normalizeJudgment(judgment) {
  const value = objectOrEmpty(judgment);
  return {
    pleasure: clamp(value.pleasure),
    disinterested: value.disinterested === true,
    communicable: value.communicable === true,
    consistency: clamp(value.consistency),
    context: value.context || null
  };
}

function evaluateTaste(args = {}) {
  const judgments = Array.isArray(args.judgments) ? args.judgments.map(normalizeJudgment) : [];
  const qualified = judgments.filter((judgment) => judgment.disinterested && judgment.communicable);
  const pleasures = qualified.map((judgment) => judgment.pleasure).filter((value) => value !== null);
  const meanPleasure = pleasures.length
    ? Number((pleasures.reduce((sum, value) => sum + value, 0) / pleasures.length).toFixed(2))
    : null;
  return {
    concept: 'aesthetics.taste',
    framework: ['hume_standard_of_taste', 'kant_sensus_communis'],
    judgmentCount: judgments.length,
    qualifiedJudgmentCount: qualified.length,
    meanPleasure,
    standardCandidate: qualified.length >= 2 && meanPleasure !== null,
    status: qualified.length >= 2 && meanPleasure !== null ? 'candidate' : 'underdetermined',
    confidence: judgments.length ? Number((qualified.length / judgments.length).toFixed(2)) : 0,
    uncertainty: judgments.length ? Number((1 - qualified.length / judgments.length).toFixed(2)) : 1,
    caveat: 'Le consensus esthétique n’est pas une preuve de validité universelle.',
    provenance: { source: 'provided_judgments', philosophicalStatus: 'interpretive' },
    evidenceRequired: qualified.length >= 2 ? [] : ['multiple_disinterested_judgments']
  };
}

function evaluateAestheticExperience(args = {}) {
  const subject = objectOrEmpty(args.experience || args.subject || args);
  const continuity = clamp(subject.continuity);
  const engagement = clamp(subject.engagement || subject.absorption);
  const consummation = clamp(subject.consummation || subject.completion);
  const livedContext = subject.livedContext || subject.context || null;
  const observed = [continuity, engagement, consummation].filter((value) => value !== null).length;
  const confidence = Number((observed / 3).toFixed(2));
  return {
    concept: 'aesthetics.aesthetic-experience',
    framework: ['dewey_art_as_experience', 'langer_feeling_and_form'],
    continuity,
    engagement,
    consummation,
    livedContext,
    experienceIntegrity: observed === 3 ? Number(((continuity + engagement + consummation) / 3).toFixed(2)) : null,
    status: observed === 3 ? 'supported' : observed ? 'underdetermined' : 'not_observed',
    confidence,
    uncertainty: Number((1 - confidence).toFixed(2)),
    provenance: { source: 'provided_lived_experience_features', philosophicalStatus: 'interpretive' },
    evidenceRequired: observed === 3 ? [] : ['lived_experience_observations']
  };
}

module.exports = {
  evaluateBeauty,
  evaluateSublime,
  evaluateTaste,
  evaluateAestheticExperience
};
