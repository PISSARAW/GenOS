'use strict';

const profiles = require('./gvxTrialRuntimeProfile');

function hasCampaignIdentity(mission) {
  return Boolean(mission?.campaignId || mission?.trialId || mission?.armId);
}

function bindCampaignMission(mission) {
  const requested = Boolean(mission?.gvxTrialCampaign === true || mission?.trialProtocol === profiles.VERSION
    || mission?.gvxTrialContext || hasCampaignIdentity(mission));
  if (!requested) return mission;
  if (!mission.gvxTrialContext) {
    throw Object.assign(new Error('GVX trial mission profile is required.'), { code: 'GVX_TRIAL_PROFILE_REQUIRED' });
  }
  const fields = profiles.missionFields(mission.gvxTrialContext);
  for (const key of ['campaignId', 'trialId', 'armId', 'scenarioId', 'seed', 'workspaceSnapshotHash', 'missionId', 'codeRevision']) {
    if (mission[key] !== undefined && mission[key] !== fields[key]) {
      throw Object.assign(new Error('GVX trial mission identity changed.'), { code: 'GVX_TRIAL_MISSION_BINDING_INVALID' });
    }
  }
  return { ...mission, ...fields };
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
  const expected = mission.gvxTrialContext.profileHash;
  const observed = worker.workerContract?.mission?.gvxTrialContext?.profileHash;
  if (observed !== expected) throw Object.assign(new Error('Worker contract did not inherit the GVX trial profile.'), {
    code: 'GVX_TRIAL_WORKER_CONTEXT_MISMATCH'
  });
}

module.exports = { bindCampaignMission, missionContractFields, attachToContract, assertWorkerContract };
