'use strict';

const profiles = require('./gvxTrialRuntimeProfile');
const IDENTITY_FIELDS = Object.freeze(['campaignId', 'trialId', 'armId', 'scenarioId', 'seed', 'workspaceSnapshotHash']);
const BINDING_FIELDS = Object.freeze([...IDENTITY_FIELDS, 'trialProtocol', 'missionId', 'codeRevision']);

function hasCampaignIdentity(mission) {
  return Boolean(mission) && IDENTITY_FIELDS.some((key) => mission[key] !== undefined);
}

function bindCampaignMission(mission) {
  if (!isTrialMission(mission)) return mission;
  if (!mission.gvxTrialContext) {
    throw Object.assign(new Error('GVX trial mission profile is required.'), { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
  }
  const fields = profiles.missionFields(mission.gvxTrialContext);
  assertIdentityFields(mission, fields);
  assertProfileHash(mission, fields);
  assertCampaignMarker(mission);
  return { ...mission, ...fields };
}

function isTrialMission(mission) {
  return Boolean(mission && (mission.gvxTrialCampaign === true || mission.trialProtocol !== undefined
    || mission.profileHash !== undefined || mission.gvxTrialContext || hasCampaignIdentity(mission)));
}

function assertIdentityFields(mission, fields) {
  if (BINDING_FIELDS.some((key) => mission[key] !== undefined && mission[key] !== fields[key])) {
    throw Object.assign(new Error('GVX trial mission identity changed.'), { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
  }
}

function assertProfileHash(mission, fields) {
  if (mission.profileHash !== undefined && mission.profileHash !== fields.gvxTrialContext.profileHash) {
    throw Object.assign(new Error('GVX trial profile hash does not match its context.'), {
      code: 'GVX_TRIAL_CONTEXT_HASH_MISMATCH'
    });
  }
}

function assertCampaignMarker(mission) {
  if (mission.gvxTrialCampaign !== undefined && mission.gvxTrialCampaign !== true) {
    throw Object.assign(new Error('GVX trial campaign marker is invalid.'), { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
  }
}

function missionContractFields(mission) {
  return mission.gvxTrialContext ? profiles.missionFields(mission.gvxTrialContext) : {};
}

function attachToContract(contract, context) {
  if (!context) return contract;
  return { ...contract, mission: { ...contract.mission, ...profiles.missionFields(context) } };
}

function assertWorkerContract(worker, mission) {
  if (!mission.gvxTrialContext) return;
  const expected = profiles.missionFields(mission.gvxTrialContext);
  const observed = worker.workerContract?.mission || {};
  const bindingFields = BINDING_FIELDS;
  if (observed.gvxTrialContext?.profileHash !== expected.gvxTrialContext.profileHash
    || bindingFields.some((key) => observed[key] !== expected[key])) {
    throw Object.assign(new Error('Worker contract did not inherit the GVX trial profile.'), {
      code: 'GVX_TRIAL_WORKER_CONTEXT_MISMATCH'
    });
  }
}

module.exports = { bindCampaignMission, missionContractFields, attachToContract, assertWorkerContract };
