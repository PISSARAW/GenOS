'use strict';

const { error, hash, sameScope } = require('./gvxContracts');
const profiles = require('./gvxTrialRuntimeProfile');
const ledger = require('./gvxDevelopmentLedger');

async function admit(db, mission, options = {}) {
  const context = profiles.bindMission(mission, options.authoritySecret);
  if (!context) throw error('GVX_TRIAL_PROFILE_REQUIRED');
  const profile = context.profile;
  if (!sameScope(profile.scope, mission.scope) || context.profileHash !== profileHash(profile)) {
    throw error('GVX_TRIAL_ADMISSION_BINDING_INVALID');
  }
  const reason = 'GVX_EXTERNAL_EVALUATOR_ISOLATION_UNAVAILABLE';
  await ledger.appendEvent(db, { id: `gvx-trial-admission:${profile.profileHash}`,
    organizationId: profile.scope.organizationId, projectId: profile.scope.projectId,
    entityId: profile.scope.entityId, type: 'decision_recorded',
    payload: { kind: 'gvx_trial_admission_blocked', campaignId: profile.campaignId,
      trialId: profile.trialId, armId: profile.armId, profileHash: profile.profileHash,
      manifestHash: profile.manifestHash, evaluatorCapabilityId: profile.externalEvaluator.capabilityId,
      reason, executable: false } });
  throw error(reason);
}

function profileHash(profile) {
  const { profileHash: value, authoritySignature: ignored, ...content } = profile;
  return hash(content);
}

module.exports = { admit };
