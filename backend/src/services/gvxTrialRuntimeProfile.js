'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const schemaCheck = require('./cognitiveOmegaSchemaCheck');
const { hash, error, sameScope } = require('./gvxContracts');

const VERSION = 'genos.gvx.runtime-arm-profile/v1';
const DIMENSIONS = Object.freeze(['acquisition', 'evolution', 'learnerFacingVerification', 'transmission']);
const ARMS = Object.freeze({
  A: ['disabled', 'disabled', 'disabled', 'disabled'],
  B: ['simple_reflection_memory', 'disabled', 'disabled', 'disabled'],
  C: ['gvx', 'gvx', 'gvx', 'gvx'], D: ['disabled', 'gvx', 'gvx', 'gvx'],
  E: ['gvx', 'disabled', 'gvx', 'gvx'], F: ['gvx', 'gvx', 'disabled', 'gvx'],
  G: ['gvx', 'gvx', 'gvx', 'disabled']
});

function validate(profile) {
  const result = schemaCheck.validate(profile, { schema: 'gvx-runtime-arm-profile.schema.json' });
  if (!result.valid) throw Object.assign(error('GVX_TRIAL_PROFILE_INVALID'), { errors: result.errors });
  if (!matchesArm(profile)) throw error('GVX_TRIAL_PROFILE_ARM_MISMATCH');
  return true;
}

function matchesArm(profile) {
  const expected = ARMS[profile.armId];
  return expected && DIMENSIONS.every((field, index) => profile[field] === expected[index]);
}

function payload(profile) {
  const { profileHash, authoritySignature, ...content } = profile;
  return content;
}

function seal(profile, authoritySecret = process.env.GENOS_GVX_TRIAL_PROFILE_SECRET) {
  requireSecret(authoritySecret);
  const candidate = { ...profile, profileHash: '0'.repeat(64), authoritySignature: '0'.repeat(64) };
  validate(candidate);
  const profileHash = hash(payload(candidate));
  const authoritySignature = signature(authoritySecret, candidate.authorityId, profileHash);
  return freezeDeep({ ...payload(candidate), profileHash, authoritySignature });
}

function verify(profile, authoritySecret = process.env.GENOS_GVX_TRIAL_PROFILE_SECRET) {
  requireSecret(authoritySecret);
  validate(profile);
  const expectedHash = hash(payload(profile));
  const expectedSignature = signature(authoritySecret, profile.authorityId, profile.profileHash);
  if (profile.profileHash !== expectedHash || !equalHex(profile.authoritySignature, expectedSignature)) {
    throw error('GVX_TRIAL_PROFILE_INTEGRITY_INVALID');
  }
  return true;
}

function bindMission(mission, authoritySecret = process.env.GENOS_GVX_TRIAL_PROFILE_SECRET) {
  if (!mission?.gvxTrialContext) return null;
  const context = mission.gvxTrialContext;
  verify(context.profile, authoritySecret);
  const profile = context.profile;
  if (context.profileHash !== profile.profileHash) throw error('GVX_TRIAL_CONTEXT_HASH_MISMATCH');
  if (!missionMatches(profile, mission)) throw error('GVX_TRIAL_MISSION_BINDING_INVALID');
  return bindContext(context, authoritySecret);
}

function bindContext(context, authoritySecret = process.env.GENOS_GVX_TRIAL_PROFILE_SECRET) {
  if (!context) return null;
  if (context.schema !== 'genos.gvx.runtime-arm-context/v1') throw error('GVX_TRIAL_CONTEXT_SCHEMA_INVALID');
  verify(context.profile, authoritySecret);
  if (context.profileHash !== context.profile.profileHash) throw error('GVX_TRIAL_CONTEXT_HASH_MISMATCH');
  return freezeDeep({ schema: 'genos.gvx.runtime-arm-context/v1', profile: freezeDeep({ ...context.profile }),
    profileHash: context.profile.profileHash });
}

function missionFields(context) {
  const bound = bindContext(context);
  if (!bound) return {};
  const profile = bound.profile;
  return { gvxTrialCampaign: true, trialProtocol: VERSION, campaignId: profile.campaignId, trialId: profile.trialId, armId: profile.armId,
    scenarioId: profile.scenarioId, seed: profile.seed, workspaceSnapshotHash: profile.workspaceSnapshotHash,
    missionId: profile.missionId, codeRevision: profile.codeRevision, gvxTrialContext: bound };
}

function missionMatches(profile, mission) {
  return profile.campaignId === mission.campaignId && profile.trialId === mission.trialId
    && profile.armId === mission.armId && profile.missionId === mission.missionId
    && profile.scenarioId === mission.scenarioId && profile.seed === mission.seed
    && profile.workspaceSnapshotHash === mission.workspaceSnapshotHash
    && sameScope(profile.scope, mission.scope) && profile.codeRevision === mission.codeRevision;
}

function assertMode(context, dimension, mode = 'gvx') {
  if (!context) return true;
  if (!DIMENSIONS.includes(dimension)) throw error('GVX_TRIAL_DIMENSION_UNKNOWN');
  bindContext(context);
  if (context.profile[dimension] !== mode) {
    throw error(`GVX_TRIAL_${dimension.toUpperCase()}_DISABLED`);
  }
  return true;
}

function assertScope(context, scope, entityId) {
  if (!context) return true;
  bindContext(context);
  if (!sameScope(context.profile.scope, { ...scope, entityId })) throw error('GVX_TRIAL_SCOPE_MISMATCH');
  return true;
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw error('GVX_TRIAL_PROFILE_AUTHORITY_SECRET_REQUIRED');
}

function signature(secret, authorityId, profileHash) {
  return createHmac('sha256', secret).update(`${authorityId}\0${profileHash}`).digest('hex');
}

function equalHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || '') || !/^[a-f0-9]{64}$/.test(right || '')) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

module.exports = { VERSION, DIMENSIONS, ARMS, validate, seal, verify, bindMission, bindContext,
  missionFields, assertMode, assertScope };
